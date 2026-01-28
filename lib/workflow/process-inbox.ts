import { listNewFiles } from "../google-drive/list-files";
import { processInboxFile } from "./process-inbox-file";
import type { BatchResult, WorkflowResult } from "./types";

/**
 * Get inbox folder ID from environment
 */
function getInboxFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_INBOX_FOLDER_ID;
  if (!folderId) {
    throw new Error("GOOGLE_DRIVE_INBOX_FOLDER_ID environment variable is required");
  }
  return folderId;
}

/**
 * Process all files in the INBOX folder
 *
 * Steps:
 * 1. List all files in INBOX folder
 * 2. For each file, call processInboxFile()
 * 3. Collect results
 * 4. Return summary
 */
export async function processAllInboxFiles(): Promise<BatchResult> {
  const inboxFolderId = getInboxFolderId();

  console.log("=== Starting Inbox Processing ===\n");
  console.log(`Inbox folder: ${inboxFolderId}`);

  // Step 1: List all files in INBOX folder
  console.log("\nListing files in INBOX...");
  const files = await listNewFiles(inboxFolderId);

  if (files.length === 0) {
    console.log("No files found in INBOX.");
    return {
      total: 0,
      processed: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };
  }

  console.log(`Found ${files.length} file(s) to process.`);

  // Step 2: Process each file
  const results: WorkflowResult[] = [];
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const result = await processInboxFile(file.id, file.name, file.mimeType);
      results.push(result);

      if (result.success) {
        if (result.skipped) {
          skipped++;
        } else {
          processed++;
        }
      } else {
        failed++;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`\nERROR processing ${file.name}: ${errorMessage}`);

      results.push({
        success: false,
        originalName: file.name,
        error: errorMessage,
      });
      failed++;
    }
  }

  // Step 3: Return summary
  console.log("\n=== Processing Complete ===\n");
  console.log(`Total files: ${files.length}`);
  console.log(`Processed:   ${processed}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Failed:      ${failed}`);

  return {
    total: files.length,
    processed,
    skipped,
    failed,
    results,
  };
}
