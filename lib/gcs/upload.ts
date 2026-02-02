import { Storage, type File as GCSFile } from "@google-cloud/storage";
import type { GCSUploadResult } from "./types";

/**
 * Get the GCS bucket name from environment
 */
function getBucketName(): string {
  const bucketName = process.env.GCS_ARCHIVE_BUCKET_NAME || process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_ARCHIVE_BUCKET_NAME or GCS_BUCKET_NAME environment variable is required");
  }
  return bucketName;
}

type GCSObjectMetadata = {
  bucket?: string;
  name?: string;
  generation?: string | number;
  md5Hash?: string;
  crc32c?: string;
  retentionExpirationTime?: string;
  retention?: {
    retainUntilTime?: string;
  };
};

type GCSMetadataProvider = (
  bucketName: string,
  objectPath: string
) => Promise<GCSObjectMetadata | null>;

let metadataProviderOverride: GCSMetadataProvider | null = null;

export function setGcsMetadataProvider(provider: GCSMetadataProvider | null): void {
  metadataProviderOverride = provider;
}

function selectHash(metadata: GCSObjectMetadata | null): {
  type?: "md5" | "crc32c";
  value?: string;
} {
  if (!metadata) return {};
  if (metadata.md5Hash) {
    return { type: "md5", value: metadata.md5Hash };
  }
  if (metadata.crc32c) {
    return { type: "crc32c", value: metadata.crc32c };
  }
  return {};
}

function retentionStatusFromMetadata(
  metadata: GCSObjectMetadata | null
): "confirmed" | "unconfirmed" {
  if (!metadata) return "unconfirmed";
  if (metadata.retentionExpirationTime || metadata.retention?.retainUntilTime) {
    return "confirmed";
  }
  return "unconfirmed";
}

async function fetchObjectMetadata(
  bucketName: string,
  objectPath: string,
  file?: GCSFile
): Promise<GCSObjectMetadata | null> {
  if (metadataProviderOverride) {
    return metadataProviderOverride(bucketName, objectPath);
  }

  if (!file) return null;

  try {
    const [metadata] = await file.getMetadata();
    return metadata as GCSObjectMetadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GCS] Metadata lookup failed: ${message}`);
    return null;
  }
}

export async function getArchiveFingerprint(
  bucketName: string,
  objectPath: string,
  file?: GCSFile
): Promise<Pick<GCSUploadResult, "gcsBucket" | "gcsObject" | "gcsGeneration" | "gcsHashType" | "gcsHashValue" | "retentionStatus">> {
  const metadata = await fetchObjectMetadata(bucketName, objectPath, file);
  const hash = selectHash(metadata);
  return {
    gcsBucket: bucketName,
    gcsObject: objectPath,
    gcsGeneration: metadata?.generation ? String(metadata.generation) : undefined,
    gcsHashType: hash.type,
    gcsHashValue: hash.value,
    retentionStatus: retentionStatusFromMetadata(metadata),
  };
}

async function applyRetentionPolicy(file: GCSFile): Promise<void> {
  const retentionDaysRaw = process.env.GCS_ARCHIVE_RETENTION_DAYS;
  if (!retentionDaysRaw) return;
  const retentionDays = Number.parseInt(retentionDaysRaw, 10);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;

  const retainUntil = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    await file.setMetadata({
      retention: {
        retainUntilTime: retainUntil,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[GCS] Retention policy not confirmed: ${message}`);
  }
}

/**
 * Generate the GCS object path for a file
 * Format: originals/{YYYY}/{MM}/{fileHash}_{originalFileName}
 */
function generateObjectPath(fileName: string, fileHash: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  // Sanitize filename - remove path separators and limit length
  const sanitizedFileName = fileName
    .replace(/[/\\]/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);

  // Use first 16 chars of hash for brevity while maintaining uniqueness
  const shortHash = fileHash.slice(0, 16);

  return `originals/${year}/${month}/${shortHash}_${sanitizedFileName}`;
}

/**
 * Upload a file to Google Cloud Storage for immutable archival
 *
 * @param fileBuffer - The file content as a Buffer
 * @param fileName - Original file name
 * @param fileHash - SHA256 hash of the file for deduplication
 * @param mimeType - MIME type of the file
 * @returns Promise resolving to GCSUploadResult
 */
export async function uploadToGCS(
  fileBuffer: Buffer,
  fileName: string,
  fileHash: string,
  mimeType: string
): Promise<GCSUploadResult> {
  try {
    const bucketName = getBucketName();
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    const objectPath = generateObjectPath(fileName, fileHash);
    const file = bucket.file(objectPath);

    // Upload with metadata
    await file.save(fileBuffer, {
      contentType: mimeType,
      metadata: {
        originalFileName: fileName,
        uploadedAt: new Date().toISOString(),
        fileHash: fileHash,
      },
      // Prevent overwriting existing files (immutability)
      preconditionOpts: {
        ifGenerationMatch: 0,
      },
    });

    const gcsPath = `gs://${bucketName}/${objectPath}`;
    await applyRetentionPolicy(file);
    const fingerprint = await getArchiveFingerprint(bucketName, objectPath, file);

    if (fingerprint.retentionStatus === "unconfirmed") {
      console.warn(
        `[GCS] Retention unconfirmed for gs://${bucketName}/${objectPath}. Configure bucket retention/lock if required.`
      );
    }

    return {
      success: true,
      gcsPath,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${objectPath}`,
      ...fingerprint,
    };
  } catch (error: unknown) {
    // Check for "already exists" condition (code 412 or conditionNotMet)
    const errorCode = (error as { code?: number })?.code;
    const errorReason = (error as { errors?: Array<{ reason?: string }> })?.errors?.[0]?.reason;

    if (errorCode === 412 || errorReason === "conditionNotMet") {
      // File already exists - this is OK, return success with existing path
      const bucketName = process.env.GCS_ARCHIVE_BUCKET_NAME || process.env.GCS_BUCKET_NAME || "";
      const objectPath = generateObjectPath(fileName, fileHash);
      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(objectPath);
      const fingerprint = await getArchiveFingerprint(bucketName, objectPath, file);
      if (fingerprint.retentionStatus === "unconfirmed") {
        console.warn(
          `[GCS] Retention unconfirmed for gs://${bucketName}/${objectPath}. Configure bucket retention/lock if required.`
        );
      }

      return {
        success: true,
        gcsPath: `gs://${bucketName}/${objectPath}`,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${objectPath}`,
        alreadyExists: true,
        ...fingerprint,
      };
    }

    // Other errors
    const errorMessage =
      error instanceof Error
        ? error.message
        : (error as { message?: string })?.message || "Unknown error occurred";

    console.error("GCS Upload Error Details:", error);

    return {
      success: false,
      gcsPath: "",
      error: errorMessage,
    };
  }
}
