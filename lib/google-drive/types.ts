/**
 * Represents a file from Google Drive
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime?: string;
  parents?: string[];
  driveId?: string;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
  size?: string;
}

/**
 * Result of moving/renaming a file
 */
export interface MoveResult {
  success: boolean;
  newFileId?: string;
  error?: string;
}

/**
 * Result of downloading a file
 */
export interface DownloadResult {
  success: boolean;
  buffer?: Buffer;
  mimeType?: string;
  error?: string;
}

/**
 * Supported MIME types for processing
 */
export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Check if a MIME type is supported for processing
 */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType);
}
