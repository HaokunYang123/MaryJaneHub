import { Storage } from "@google-cloud/storage";
import type { GCSUploadResult } from "./types";

/**
 * Get the GCS bucket name from environment
 */
function getBucketName(): string {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME environment variable is required");
  }
  return bucketName;
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

    return {
      success: true,
      gcsPath,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${objectPath}`,
    };
  } catch (error: unknown) {
    // Check for "already exists" condition (code 412 or conditionNotMet)
    const errorCode = (error as { code?: number })?.code;
    const errorReason = (error as { errors?: Array<{ reason?: string }> })?.errors?.[0]?.reason;

    if (errorCode === 412 || errorReason === "conditionNotMet") {
      // File already exists - this is OK, return success with existing path
      const bucketName = process.env.GCS_BUCKET_NAME || "";
      const objectPath = generateObjectPath(fileName, fileHash);
      return {
        success: true,
        gcsPath: `gs://${bucketName}/${objectPath}`,
        publicUrl: `https://storage.googleapis.com/${bucketName}/${objectPath}`,
        alreadyExists: true,
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
