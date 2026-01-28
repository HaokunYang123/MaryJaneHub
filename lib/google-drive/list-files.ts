import { getDriveClient } from "./client";
import type { DriveFile } from "./types";
import { SUPPORTED_MIME_TYPES } from "./types";

/**
 * List files in a Google Drive folder
 *
 * @param folderId - The Google Drive folder ID
 * @param onlySupportedTypes - If true, only return PDF and image files
 * @returns Promise resolving to array of DriveFile
 */
export async function listNewFiles(
  folderId: string,
  onlySupportedTypes = true
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

  const response = await drive.files.list({
    q: query,
    fields: "files(id, name, mimeType, createdTime, size)",
    orderBy: "createdTime asc", // Oldest first for FIFO processing
    pageSize: 100,
  });

  const files = response.data.files || [];

  return files.map((file) => ({
    id: file.id || "",
    name: file.name || "",
    mimeType: file.mimeType || "",
    createdTime: file.createdTime || "",
    size: file.size || undefined,
  }));
}

/**
 * Get a single file's metadata by ID
 */
export async function getFileMetadata(fileId: string): Promise<DriveFile | null> {
  const drive = getDriveClient();

  try {
    const response = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, createdTime, size",
    });

    const file = response.data;
    return {
      id: file.id || "",
      name: file.name || "",
      mimeType: file.mimeType || "",
      createdTime: file.createdTime || "",
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
