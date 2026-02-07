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

export interface CorpusListOptions {
  onlySupportedTypes?: boolean;
  maxFiles?: number;
  includeFolders?: boolean;
}

export interface CorpusDriveFile extends DriveFile {
  source: "user" | "shared_drive";
  sharedDriveId?: string;
  modifiedTime?: string;
  parents?: string[];
  md5Checksum?: string;
  appProperties?: Record<string, string>;
}

export interface CorpusListResult {
  files: CorpusDriveFile[];
  totals: {
    user: number;
    sharedDrive: number;
  };
  sharedDrivesScanned: number;
}

function buildQuery(onlySupportedTypes: boolean, includeFolders: boolean): string {
  const clauses: string[] = ["trashed = false"];

  if (!includeFolders) {
    clauses.push("mimeType != 'application/vnd.google-apps.folder'");
  }

  if (onlySupportedTypes) {
    const mimeTypeFilters = SUPPORTED_MIME_TYPES.map((type) => `mimeType = '${type}'`).join(" or ");
    clauses.push(`(${mimeTypeFilters})`);
  }

  return clauses.join(" and ");
}

function normalizeFile(
  file: {
    id?: string | null;
    name?: string | null;
    mimeType?: string | null;
    createdTime?: string | null;
    modifiedTime?: string | null;
    size?: string | null;
    parents?: string[] | null;
    driveId?: string | null;
    md5Checksum?: string | null;
    appProperties?: Record<string, string> | null;
  },
  source: "user" | "shared_drive",
  sharedDriveId?: string
): CorpusDriveFile {
  return {
    id: file.id || "",
    name: file.name || "",
    mimeType: file.mimeType || "",
    createdTime: file.createdTime || "",
    size: file.size || undefined,
    modifiedTime: file.modifiedTime || undefined,
    parents: file.parents || undefined,
    driveId: file.driveId || undefined,
    md5Checksum: file.md5Checksum || undefined,
    appProperties: file.appProperties || undefined,
    source,
    sharedDriveId,
  };
}

async function listFromSource(
  requestFactory: (pageToken?: string) => Promise<{
    files: Array<{
      id?: string | null;
      name?: string | null;
      mimeType?: string | null;
      createdTime?: string | null;
      modifiedTime?: string | null;
      size?: string | null;
      parents?: string[] | null;
      driveId?: string | null;
      md5Checksum?: string | null;
      appProperties?: Record<string, string> | null;
    }>;
    nextPageToken?: string;
  }>,
  source: "user" | "shared_drive",
  maxFiles: number,
  sharedDriveId?: string
): Promise<CorpusDriveFile[]> {
  const files: CorpusDriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await requestFactory(pageToken);
    for (const row of response.files) {
      files.push(normalizeFile(row, source, sharedDriveId));
      if (files.length >= maxFiles) return files;
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  return files;
}

async function listSharedDriveIds(): Promise<string[]> {
  const drive = getDriveClient();
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const response = await retry(
      () =>
        drive.drives.list({
          pageSize: 100,
          pageToken,
          fields: "nextPageToken, drives(id)",
        }),
      DRIVE_RETRY_OPTIONS
    );

    for (const sharedDrive of response.data.drives || []) {
      if (sharedDrive.id) ids.push(sharedDrive.id);
    }

    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);

  return ids;
}

export async function listCorpusFiles(options: CorpusListOptions = {}): Promise<CorpusListResult> {
  const drive = getDriveClient();
  const onlySupportedTypes = options.onlySupportedTypes ?? false;
  const includeFolders = options.includeFolders ?? false;
  const maxFiles = options.maxFiles ?? 1000;
  const query = buildQuery(onlySupportedTypes, includeFolders);

  const userFiles = await listFromSource(
    async (pageToken?: string) => {
      const response = await retry(
        () =>
          drive.files.list({
            corpora: "user",
            q: query,
            pageSize: 100,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            fields:
              "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size, parents, driveId, md5Checksum, appProperties)",
            orderBy: "createdTime asc",
          }),
        DRIVE_RETRY_OPTIONS
      );

      return {
        files: response.data.files || [],
        nextPageToken: response.data.nextPageToken || undefined,
      };
    },
    "user",
    maxFiles
  );

  if (userFiles.length >= maxFiles) {
    return {
      files: userFiles,
      totals: { user: userFiles.length, sharedDrive: 0 },
      sharedDrivesScanned: 0,
    };
  }

  const sharedDriveIds = await listSharedDriveIds();
  const sharedFiles: CorpusDriveFile[] = [];

  for (const sharedDriveId of sharedDriveIds) {
    if (userFiles.length + sharedFiles.length >= maxFiles) break;
    const remaining = maxFiles - (userFiles.length + sharedFiles.length);

    const driveFiles = await listFromSource(
      async (pageToken?: string) => {
        const response = await retry(
          () =>
            drive.files.list({
              corpora: "drive",
              driveId: sharedDriveId,
              q: query,
              pageSize: 100,
              pageToken,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
              fields:
                "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size, parents, driveId, md5Checksum, appProperties)",
              orderBy: "createdTime asc",
            }),
          DRIVE_RETRY_OPTIONS
        );

        return {
          files: response.data.files || [],
          nextPageToken: response.data.nextPageToken || undefined,
        };
      },
      "shared_drive",
      remaining,
      sharedDriveId
    );

    sharedFiles.push(...driveFiles);
  }

  return {
    files: [...userFiles, ...sharedFiles],
    totals: {
      user: userFiles.length,
      sharedDrive: sharedFiles.length,
    },
    sharedDrivesScanned: sharedDriveIds.length,
  };
}
