import { getDriveClient } from "./client";
import type { DownloadResult } from "./types";
import { retry } from "../utils/retry";

const DRIVE_RETRY_OPTIONS = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true,
};

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
    const metadataResponse = await retry(
      () =>
        drive.files.get({
          fileId,
          fields: "mimeType",
        }),
      DRIVE_RETRY_OPTIONS
    );
    const mimeType = metadataResponse.data.mimeType || "application/octet-stream";

    // Download the file content
    const response = await retry(
      () =>
        drive.files.get(
          {
            fileId,
            alt: "media",
          },
          {
            responseType: "arraybuffer",
          }
        ),
      DRIVE_RETRY_OPTIONS
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
