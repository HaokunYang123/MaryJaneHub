import { getDriveClient } from "./client";
import { retry } from "../utils/retry";

const DRIVE_RETRY_OPTIONS = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true,
};

export type DriveAppProperties = Record<string, string>;

export interface MetadataResult {
  success: boolean;
  fileId: string;
  appProperties?: DriveAppProperties;
  error?: string;
}

function toAppProperties(input: Record<string, unknown>): DriveAppProperties {
  const output: DriveAppProperties = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key || value === undefined || value === null) continue;
    output[key] = String(value);
  }
  return output;
}

export async function getAppProperties(fileId: string): Promise<MetadataResult> {
  const drive = getDriveClient();

  try {
    const response = await retry(
      () =>
        drive.files.get({
          fileId,
          fields: "id, appProperties",
          supportsAllDrives: true,
        }),
      DRIVE_RETRY_OPTIONS
    );

    return {
      success: true,
      fileId,
      appProperties: (response.data.appProperties || {}) as DriveAppProperties,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, fileId, error: message };
  }
}

export async function setAppProperties(
  fileId: string,
  appProperties: Record<string, unknown>
): Promise<MetadataResult> {
  const drive = getDriveClient();
  const sanitized = toAppProperties(appProperties);

  try {
    const response = await retry(
      () =>
        drive.files.update({
          fileId,
          supportsAllDrives: true,
          fields: "id, appProperties",
          requestBody: {
            appProperties: sanitized,
          },
        }),
      DRIVE_RETRY_OPTIONS
    );

    return {
      success: true,
      fileId,
      appProperties: (response.data.appProperties || {}) as DriveAppProperties,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, fileId, error: message };
  }
}

export async function mergeAppProperties(
  fileId: string,
  appProperties: Record<string, unknown>
): Promise<MetadataResult> {
  const existing = await getAppProperties(fileId);
  if (!existing.success) return existing;

  return setAppProperties(fileId, {
    ...(existing.appProperties || {}),
    ...toAppProperties(appProperties),
  });
}
