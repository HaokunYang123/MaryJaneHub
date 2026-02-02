#!/usr/bin/env npx tsx
/**
 * Deterministic Drive retry tests (no network).
 */

import { setDriveClientOverride } from "../lib/google-drive/client";
import { listNewFiles, getFileMetadata } from "../lib/google-drive/list-files";
import { downloadFile } from "../lib/google-drive/download";
import { moveAndRenameFile, renameFile } from "../lib/google-drive/move-file";

type DriveStub = {
  files: {
    list?: (...args: unknown[]) => Promise<unknown>;
    get?: (...args: unknown[]) => Promise<unknown>;
    update?: (...args: unknown[]) => Promise<unknown>;
  };
};

function createError(code: number | string, message = "Drive error"): Error {
  const err = new Error(message) as Error & { code?: number | string };
  err.code = code;
  return err;
}

async function withDriveOverride<T>(
  drive: DriveStub,
  fn: () => Promise<T>
): Promise<T> {
  setDriveClientOverride(drive as unknown as Parameters<typeof setDriveClientOverride>[0]);
  try {
    return await fn();
  } finally {
    setDriveClientOverride(null);
  }
}

async function run(): Promise<void> {
  const failures: string[] = [];

  // 1) listNewFiles retries on 429
  await withDriveOverride(
    {
      files: {
        list: async () => {
          listCalls++;
          if (listCalls <= 2) {
            throw createError(429, "Rate limited");
          }
          return {
            data: {
              files: [
                {
                  id: "file-1",
                  name: "doc.pdf",
                  mimeType: "application/pdf",
                  createdTime: "2026-01-01T00:00:00.000Z",
                  size: "123",
                },
              ],
              nextPageToken: undefined,
            },
          };
        },
      },
    },
    async () => {
      listCalls = 0;
      const files = await listNewFiles("folder-1");
      if (listCalls !== 3) {
        failures.push(`listNewFiles retry count expected 3, got ${listCalls}`);
      }
      if (files.length !== 1) {
        failures.push(`listNewFiles expected 1 file, got ${files.length}`);
      }
    }
  );

  // 2) moveAndRenameFile does not retry on 400
  await withDriveOverride(
    {
      files: {
        update: async () => {
          moveCalls++;
          throw createError(400, "Bad Request");
        },
      },
    },
    async () => {
      moveCalls = 0;
      const result = await moveAndRenameFile("file-2", "new.pdf", "target", "source");
      if (moveCalls !== 1) {
        failures.push(`moveAndRenameFile should not retry 400, got ${moveCalls} calls`);
      }
      if (result.success !== false) {
        failures.push("moveAndRenameFile expected success=false on 400");
      }
    }
  );

  // 3) downloadFile retries media request on 500
  await withDriveOverride(
    {
      files: {
        get: async (params: { alt?: string }) => {
          if (params?.alt === "media") {
            mediaCalls++;
            if (mediaCalls === 1) {
              throw createError(500, "Server error");
            }
            return { data: new Uint8Array([1, 2, 3]).buffer };
          }
          metadataCalls++;
          return { data: { mimeType: "application/pdf" } };
        },
      },
    },
    async () => {
      mediaCalls = 0;
      metadataCalls = 0;
      const result = await downloadFile("file-3");
      if (!result.success) {
        failures.push("downloadFile expected success after retry");
      }
      if (mediaCalls !== 2) {
        failures.push(`downloadFile media calls expected 2, got ${mediaCalls}`);
      }
      if (metadataCalls !== 1) {
        failures.push(`downloadFile metadata calls expected 1, got ${metadataCalls}`);
      }
    }
  );

  // 4) renameFile retries on 500
  await withDriveOverride(
    {
      files: {
        update: async () => {
          renameCalls++;
          if (renameCalls === 1) {
            throw createError(500, "Server error");
          }
          return { data: { id: "file-4", name: "renamed.pdf" } };
        },
      },
    },
    async () => {
      renameCalls = 0;
      const result = await renameFile("file-4", "renamed.pdf");
      if (!result.success) {
        failures.push("renameFile expected success after retry");
      }
      if (renameCalls !== 2) {
        failures.push(`renameFile calls expected 2, got ${renameCalls}`);
      }
    }
  );

  // 5) getFileMetadata returns null on 404 without retry storms
  await withDriveOverride(
    {
      files: {
        get: async () => {
          metadata404Calls++;
          throw createError(404, "Not Found");
        },
      },
    },
    async () => {
      metadata404Calls = 0;
      const result = await getFileMetadata("file-5");
      if (result !== null) {
        failures.push("getFileMetadata expected null on 404");
      }
      if (metadata404Calls !== 1) {
        failures.push(`getFileMetadata calls expected 1, got ${metadata404Calls}`);
      }
    }
  );

  if (failures.length > 0) {
    console.error("Drive retry test FAILED:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log("Drive retry test PASSED");
}

let listCalls = 0;
let moveCalls = 0;
let mediaCalls = 0;
let metadataCalls = 0;
let renameCalls = 0;
let metadata404Calls = 0;

run().catch((error) => {
  console.error("Drive retry test failed:", error);
  process.exit(1);
});
