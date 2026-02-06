#!/usr/bin/env npx tsx
/**
 * Rename Processed Files Script
 *
 * Renames existing files in Google Drive to use the new format with document type prefix.
 * Run with --execute flag to actually rename files, otherwise does a dry run.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { getSupabase } from "@/lib/supabase/client";
import { appendNeedsReviewSuffix, generateCleanFilename } from "@/lib/utils/filename";
import { getDriveClient } from "@/lib/google-drive/client";
import type { DocumentExtraction } from "@/lib/gemini/extract-document";

interface RenameResult {
  total: number;
  renamed: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; oldName: string; error: string }>;
}

async function renameProcessedFiles(dryRun: boolean = true): Promise<RenameResult> {
  const supabase = getSupabase();
  const drive = getDriveClient();

  // Get all documents with drive_file_id
  const { data: documents, error } = await supabase
    .from("documents")
    .select("id, file_name, drive_file_id, document_type, extraction, sync_status")
    .not("drive_file_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  console.log(`Found ${documents.length} documents to check\n`);

  const result: RenameResult = {
    total: documents.length,
    renamed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const doc of documents) {
    try {
      // Skip if no drive_file_id
      if (!doc.drive_file_id) {
        result.skipped++;
        continue;
      }

      // Build extraction object for generateCleanFilename
      // The extraction column should already have type and data
      const extraction = doc.extraction as DocumentExtraction;

      // Generate new filename using updated function
      // Pass document_type from database as override (canonical source of truth)
      const baseName = generateCleanFilename(
        extraction,
        doc.file_name,
        doc.document_type as any
      );
      const needsReview = doc.sync_status === "needs_attention" ||
        doc.sync_status === "pending_review" ||
        doc.sync_status === "ocr_failed" ||
        doc.sync_status === "extraction_failed";
      const newName = needsReview ? appendNeedsReviewSuffix(baseName) : baseName;

      // Check if rename needed
      if (doc.file_name === newName) {
        result.skipped++;
        continue;
      }

      console.log(`[Rename] ${doc.file_name}`);
      console.log(`     -> ${newName}`);

      if (!dryRun) {
        // Rename in Google Drive
        await drive.files.update({
          fileId: doc.drive_file_id,
          requestBody: { name: newName },
        });

        // Update database
        const { error: updateError } = await supabase
          .from("documents")
          .update({ file_name: newName })
          .eq("id", doc.id);

        if (updateError) {
          throw updateError;
        }

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 100));
      }

      result.renamed++;
    } catch (err) {
      console.error(`[Error] ${doc.file_name}:`, err);
      result.failed++;
      result.errors.push({
        id: doc.id,
        oldName: doc.file_name,
        error: String(err),
      });
    }
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  console.log("=".repeat(60));
  console.log(`Rename Processed Files ${dryRun ? "(DRY RUN)" : "(EXECUTING)"}`);
  console.log("=".repeat(60) + "\n");

  if (dryRun) {
    console.log("This is a DRY RUN. No files will be renamed.");
    console.log("Add --execute flag to actually rename files.\n");
  }

  const result = await renameProcessedFiles(dryRun);

  console.log("\n" + "=".repeat(60));
  console.log("Results:");
  console.log("=".repeat(60));
  console.log(`  Total:   ${result.total}`);
  console.log(`  Renamed: ${result.renamed}`);
  console.log(`  Skipped: ${result.skipped} (already correct)`);
  console.log(`  Failed:  ${result.failed}`);

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    result.errors.forEach((e) => console.log(`  - ${e.oldName}: ${e.error}`));
  }
}

main().catch(console.error);
