import { getDriveClient } from "./client.js";
import type { MoveResult } from "./types.js";

/**
 * Move and rename a file in Google Drive
 *
 * @param fileId - The Google Drive file ID
 * @param newName - New name for the file
 * @param targetFolderId - Destination folder ID
 * @param sourceFolderId - Source folder ID (to remove from)
 * @returns Promise resolving to MoveResult
 */
export async function moveAndRenameFile(
  fileId: string,
  newName: string,
  targetFolderId: string,
  sourceFolderId: string
): Promise<MoveResult> {
  const drive = getDriveClient();

  try {
    const response = await drive.files.update({
      fileId,
      addParents: targetFolderId,
      removeParents: sourceFolderId,
      requestBody: {
        name: newName,
      },
      fields: "id, name, parents",
    });

    return {
      success: true,
      newFileId: response.data.id || fileId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const statusCode = (error as { code?: number })?.code;

    if (statusCode === 404) {
      return {
        success: false,
        error: `File not found: ${fileId}`,
      };
    }

    if (statusCode === 403) {
      return {
        success: false,
        error: `Permission denied for file: ${fileId}`,
      };
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Rename a file without moving it
 */
export async function renameFile(
  fileId: string,
  newName: string
): Promise<MoveResult> {
  const drive = getDriveClient();

  try {
    const response = await drive.files.update({
      fileId,
      requestBody: {
        name: newName,
      },
      fields: "id, name",
    });

    return {
      success: true,
      newFileId: response.data.id || fileId,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return {
      success: false,
      error: errorMessage,
    };
  }
}
