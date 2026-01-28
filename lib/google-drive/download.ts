import { getDriveClient } from "./client";
import type { DownloadResult } from "./types";

/**
 * Download a file from Google Drive as a Buffer
 *
 * @param fileId - The Google Drive file ID
 * @returns Promise resolving to DownloadResult with buffer
 */
export async function downloadFile(fileId: string): Promise<DownloadResult> {
  const drive = getDriveClient();

  try {
    // First get file metadata to know the MIME type
    const metadataResponse = await drive.files.get({
      fileId,
      fields: "mimeType",
    });
    const mimeType = metadataResponse.data.mimeType || "application/octet-stream";

    // Download the file content
    const response = await drive.files.get(
      {
        fileId,
        alt: "media",
      },
      {
        responseType: "arraybuffer",
      }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);

    return {
      success: true,
      buffer,
      mimeType,
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

    return {
      success: false,
      error: errorMessage,
    };
  }
}
