import { google } from "googleapis";
import type { drive_v3 } from "googleapis";

let driveInstance: drive_v3.Drive | null = null;
let driveOverride: drive_v3.Drive | null = null;

export function setDriveClientOverride(client: drive_v3.Drive | null): void {
  driveOverride = client;
}

/**
 * Get authenticated Google Drive client
 * Uses Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)
 */
export function getDriveClient(): drive_v3.Drive {
  if (driveOverride) {
    return driveOverride;
  }

  if (!driveInstance) {
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/drive"],
    });

    driveInstance = google.drive({ version: "v3", auth });
  }

  return driveInstance;
}
