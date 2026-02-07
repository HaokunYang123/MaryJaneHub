import { getDriveClient } from "./client";
import type { MoveResult } from "./types";
import { retry } from "../utils/retry";
import { getManagedRootIds } from "./managed-zone";

const DRIVE_RETRY_OPTIONS = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true,
};

async function getFolderParents(
  folderId: string,
  cache: Map<string, string[]>
): Promise<string[]> {
  const cached = cache.get(folderId);
  if (cached) return cached;

  const drive = getDriveClient();
  const response = await retry(
    () =>
      drive.files.get({
        fileId: folderId,
        fields: "id, parents",
        supportsAllDrives: true,
      }),
    DRIVE_RETRY_OPTIONS
  );

  const parents = response.data.parents || [];
  cache.set(folderId, parents);
  return parents;
}

async function isFolderInsideManagedRoots(
  folderId: string,
  managedRoots: Set<string>,
  cache: Map<string, string[]>
): Promise<boolean> {
  if (!folderId) return false;
  if (managedRoots.has(folderId)) return true;

  const queue: string[] = [folderId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    if (managedRoots.has(current)) return true;

    try {
      const parents = await getFolderParents(current, cache);
      for (const parentId of parents) {
        if (!visited.has(parentId)) queue.push(parentId);
      }
    } catch {
      // If parent lookup fails, treat as outside managed roots.
      return false;
    }
  }

  return false;
}

async function validateManagedMoveBoundaries(
  sourceFolderId: string,
  targetFolderId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const roots = getManagedRootIds();
  if (roots.length === 0) {
    return { ok: true };
  }

  const managedRoots = new Set(roots);
  const cache = new Map<string, string[]>();
  const [sourceAllowed, targetAllowed] = await Promise.all([
    isFolderInsideManagedRoots(sourceFolderId, managedRoots, cache),
    isFolderInsideManagedRoots(targetFolderId, managedRoots, cache),
  ]);

  if (!sourceAllowed || !targetAllowed) {
    return {
      ok: false,
      error:
        "Write denied: move/rename is allowed only within configured AI-managed root folders",
    };
  }

  return { ok: true };
}

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
    const response = await retry(
      () =>
        drive.files.update({
          fileId,
          addParents: targetFolderId,
          removeParents: sourceFolderId,
          supportsAllDrives: true,
          requestBody: {
            name: newName,
          },
          fields: "id, name, parents",
        }),
      DRIVE_RETRY_OPTIONS
    );

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
 * Move/rename with AI-managed zone guard.
 *
 * If GOOGLE_DRIVE_AI_MANAGED_ROOT_IDS is configured, both source and target
 * folders must resolve under those roots.
 */
export async function moveAndRenameFileWithinManagedRoots(
  fileId: string,
  newName: string,
  targetFolderId: string,
  sourceFolderId: string
): Promise<MoveResult> {
  const validation = await validateManagedMoveBoundaries(sourceFolderId, targetFolderId);
  if (!validation.ok) {
    return {
      success: false,
      error: validation.error,
    };
  }

  return moveAndRenameFile(fileId, newName, targetFolderId, sourceFolderId);
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
    const response = await retry(
      () =>
        drive.files.update({
          fileId,
          supportsAllDrives: true,
          requestBody: {
            name: newName,
          },
          fields: "id, name",
        }),
      DRIVE_RETRY_OPTIONS
    );

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
