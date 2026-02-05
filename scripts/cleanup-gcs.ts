#!/usr/bin/env tsx
/**
 * GCS Cleanup Script
 *
 * Deletes all objects (optionally by prefix) from the archive bucket.
 * Defaults to dry-run unless --confirm is provided.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { Storage } from "@google-cloud/storage";
import pLimit from "p-limit";

interface CleanupOptions {
  confirm: boolean;
  prefix?: string;
  versions: boolean;
}

function resolveBucketName(): string {
  const bucketName =
    process.env.GCS_ARCHIVE_BUCKET_NAME || process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("GCS_ARCHIVE_BUCKET_NAME or GCS_BUCKET_NAME is required");
  }
  return bucketName;
}

function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const prefixArg = args.find((arg) => arg.startsWith("--prefix="));
  const versions = args.includes("--versions");
  const prefix = prefixArg ? prefixArg.split("=")[1] : undefined;
  return { confirm, prefix, versions };
}

async function listAllFiles(params: {
  storage: Storage;
  bucketName: string;
  prefix?: string;
  versions: boolean;
}): Promise<Array<{ name: string; generation?: string }>> {
  const bucket = params.storage.bucket(params.bucketName);
  const files: Array<{ name: string; generation?: string }> = [];
  let pageToken: string | undefined;

  do {
    const [pageFiles, _nextQuery, response] = await bucket.getFiles({
      prefix: params.prefix,
      pageToken,
      autoPaginate: false,
      versions: params.versions,
    });

    for (const file of pageFiles) {
      const generation = file.metadata?.generation ? String(file.metadata.generation) : undefined;
      files.push({ name: file.name, generation });
    }

    pageToken = response?.nextPageToken || undefined;
  } while (pageToken);

  return files;
}

async function deleteFiles(params: {
  storage: Storage;
  bucketName: string;
  files: Array<{ name: string; generation?: string }>;
}): Promise<{ deleted: number; failed: number }>
{
  const bucket = params.storage.bucket(params.bucketName);
  const limit = pLimit(10);
  let deleted = 0;
  let failed = 0;

  await Promise.all(
    params.files.map((file) =>
      limit(async () => {
        try {
          const target = file.generation
            ? bucket.file(file.name, { generation: Number(file.generation) })
            : bucket.file(file.name);
          await target.delete();
          deleted += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to delete ${file.name}: ${message}`);
          failed += 1;
        }
      })
    )
  );

  return { deleted, failed };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const bucketName = resolveBucketName();
  const storage = new Storage();

  console.log("=".repeat(60));
  console.log("GCS CLEANUP SCRIPT");
  console.log("=".repeat(60));
  console.log(`Bucket: ${bucketName}`);
  console.log(`Prefix: ${options.prefix || "(none)"}`);
  console.log(`Versions: ${options.versions ? "all" : "current only"}`);
  console.log(`Mode: ${options.confirm ? "LIVE" : "DRY RUN"}`);
  console.log();

  const files = await listAllFiles({
    storage,
    bucketName,
    prefix: options.prefix,
    versions: options.versions,
  });

  console.log(`Objects found: ${files.length}`);
  if (files.length > 0) {
    files.slice(0, 5).forEach((file) => {
      console.log(`  - ${file.name}${file.generation ? ` (gen ${file.generation})` : ""}`);
    });
    if (files.length > 5) {
      console.log(`  ... and ${files.length - 5} more`);
    }
  }

  if (!options.confirm) {
    console.log("\nDry run complete. Re-run with --confirm to delete.");
    return;
  }

  if (files.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  console.log("\nDeleting objects...");
  const result = await deleteFiles({ storage, bucketName, files });
  console.log(`\nDeleted: ${result.deleted}, Failed: ${result.failed}`);
  console.log("\nCleanup complete.");
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
