import { getDriveClient } from "./client";
import type { DriveFile } from "./types";
import { SUPPORTED_MIME_TYPES } from "./types";
import { retry } from "../utils/retry";

const DRIVE_RETRY_OPTIONS = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true,
};

/**
 * List files in a Google Drive folder
 *
 * @param folderId - The Google Drive folder ID
 * @param onlySupportedTypes - If true, only return PDF and image files
 * @param maxFiles - Maximum number of files to return (default: 1000)
 * @returns Promise resolving to array of DriveFile
 */
export async function listNewFiles(
  folderId: string,
  onlySupportedTypes = true,
  maxFiles = 1000
): Promise<DriveFile[]> {
  const drive = getDriveClient();

  // Build query: files in the folder that are not trashed
  let query = `'${folderId}' in parents and trashed = false`;

  // Filter by MIME types if requested
  if (onlySupportedTypes) {
    const mimeTypeFilters = SUPPORTED_MIME_TYPES.map(
      (type) => `mimeType = '${type}'`
    ).join(" or ");
    query += ` and (${mimeTypeFilters})`;
  }

  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  // Paginate through all results
  do {
    const response = await retry(
      () =>
        drive.files.list({
          q: query,
          fields:
            "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size, parents, driveId, md5Checksum, appProperties)",
          orderBy: "createdTime asc", // Oldest first for FIFO processing
          pageSize: 100, // Max per page
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        }),
      DRIVE_RETRY_OPTIONS
    );

    const files = response.data.files || [];

    for (const file of files) {
      allFiles.push({
        id: file.id || "",
        name: file.name || "",
        mimeType: file.mimeType || "",
        createdTime: file.createdTime || "",
        modifiedTime: file.modifiedTime || undefined,
        parents: file.parents || undefined,
        driveId: file.driveId || undefined,
        md5Checksum: file.md5Checksum || undefined,
        appProperties: (file.appProperties as Record<string, string> | undefined) || undefined,
        size: file.size || undefined,
      });

      // Stop if we've reached the max
      if (allFiles.length >= maxFiles) {
        console.log(`[Drive] Reached max files limit (${maxFiles}), stopping pagination`);
        return allFiles;
      }
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return allFiles;
}

/**
 * Get a single file's metadata by ID
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile | null> {
  const drive = getDriveClient();

  try {
    const response = await retry(
      () =>
        drive.files.get({
          fileId,
          fields:
            "id, name, mimeType, createdTime, modifiedTime, size, parents, driveId, md5Checksum, appProperties",
          supportsAllDrives: true,
        }),
      DRIVE_RETRY_OPTIONS
    );

    const file = response.data;
    return {
      id: file.id || "",
      name: file.name || "",
      mimeType: file.mimeType || "",
      createdTime: file.createdTime || "",
      modifiedTime: file.modifiedTime || undefined,
      parents: file.parents || undefined,
      driveId: file.driveId || undefined,
      md5Checksum: file.md5Checksum || undefined,
      appProperties: (file.appProperties as Record<string, string> | undefined) || undefined,
      size: file.size || undefined,
    };
  } catch (error) {
    const statusCode = (error as { code?: number })?.code;
    if (statusCode === 404) {
      return null;
    }
    throw error;
  }
}
