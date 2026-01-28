import { downloadFile } from "../google-drive/download.js";
import { moveAndRenameFile } from "../google-drive/move-file.js";
import { processDocument } from "../pipeline/process-document.js";
import { updateDocumentDriveInfo } from "../supabase/documents.js";
import { generateCleanFilename } from "../utils/filename.js";
import type { WorkflowResult } from "./types.js";

/**
 * Get folder IDs from environment
 */
function getFolderIds() {
  const inboxFolderId = process.env.GOOGLE_DRIVE_INBOX_FOLDER_ID;
  const processedFolderId = process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID;

  if (!inboxFolderId) {
    throw new Error("GOOGLE_DRIVE_INBOX_FOLDER_ID environment variable is required");
  }
  if (!processedFolderId) {
    throw new Error("GOOGLE_DRIVE_PROCESSED_FOLDER_ID environment variable is required");
  }

  return { inboxFolderId, processedFolderId };
}

/**
 * Process a single file from the INBOX folder
 *
 * Steps:
 * 1. Download file from Drive
 * 2. Run pipeline (includes duplicate check, OCR → Gemini → GCS → Supabase)
 * 3. Generate clean filename from extraction
 * 4. Move and rename file to Processed folder
 * 5. Update document in Supabase with drive_file_id
 */
export async function processInboxFile(
  fileId: string,
  fileName: string,
  mimeType: string
): Promise<WorkflowResult> {
  const { inboxFolderId, processedFolderId } = getFolderIds();

  console.log(`\n--- Processing: ${fileName} ---`);

  // Step 1: Download file from Drive
  console.log("  [1/5] Downloading from Drive...");
  const downloadResult = await downloadFile(fileId);

  if (!downloadResult.success || !downloadResult.buffer) {
    console.log(`  ERROR: Download failed - ${downloadResult.error}`);
    return {
      success: false,
      originalName: fileName,
      error: `Download failed: ${downloadResult.error}`,
    };
  }

  const fileBuffer = downloadResult.buffer;
  console.log(`  Downloaded: ${(fileBuffer.length / 1024).toFixed(2)} KB`);

  // Step 2: Run pipeline (includes duplicate check, OCR → Gemini → GCS → Supabase)
  console.log("  [2/5] Running processing pipeline...");
  const pipelineResult = await processDocument(fileBuffer, mimeType, fileName);

  // Handle duplicate detection
  if (pipelineResult.status === "duplicate") {
    console.log(`  DUPLICATE: File already processed (document ID: ${pipelineResult.existingDocumentId})`);

    // Move the duplicate file to processed folder to clean up inbox
    const cleanName = generateCleanFilename(pipelineResult.extraction, fileName);
    try {
      await moveAndRenameFile(fileId, cleanName, processedFolderId, inboxFolderId);
      console.log(`  Moved duplicate to Processed folder as: ${cleanName}`);
    } catch (moveErr) {
      console.warn(`  Warning: Could not move duplicate file: ${moveErr}`);
    }

    return {
      success: true,
      documentId: pipelineResult.existingDocumentId,
      originalName: fileName,
      newName: cleanName,
      skipped: true,
    };
  }

  if (pipelineResult.status !== "success") {
    console.log(`  ERROR: Pipeline failed - ${pipelineResult.error}`);
    return {
      success: false,
      originalName: fileName,
      error: `Pipeline failed: ${pipelineResult.error}`,
    };
  }

  const extractionData = pipelineResult.extraction.data;
  const displayName = "vendor" in extractionData ? extractionData.vendor :
                      "merchant_name" in extractionData ? extractionData.merchant_name :
                      "bank_name" in extractionData ? extractionData.bank_name : "Unknown";
  const displayTotal = "total" in extractionData ? extractionData.total :
                       "closing_balance" in extractionData ? extractionData.closing_balance : 0;
  console.log(`  Pipeline complete: ${displayName || "Unknown"} - $${displayTotal || 0}`);

  // Step 3: Generate clean filename from extraction
  console.log("  [3/5] Generating clean filename...");
  const cleanName = generateCleanFilename(pipelineResult.extraction, fileName);
  console.log(`  New name: ${cleanName}`);

  // Step 4: Move and rename file to Processed folder
  console.log("  [4/5] Moving to Processed folder...");
  const moveResult = await moveAndRenameFile(
    fileId,
    cleanName,
    processedFolderId,
    inboxFolderId
  );

  if (!moveResult.success) {
    console.log(`  WARNING: Move failed - ${moveResult.error}`);
    // Don't fail the whole workflow, document is still saved
  } else {
    console.log(`  Moved successfully`);
  }

  // Step 5: Update document in Supabase with drive_file_id
  console.log("  [5/5] Updating database with Drive info...");
  if (pipelineResult.documentId) {
    const updateSuccess = await updateDocumentDriveInfo(
      pipelineResult.documentId,
      fileId,
      cleanName
    );
    if (updateSuccess) {
      console.log(`  Database updated`);
    } else {
      console.log(`  WARNING: Could not update database with Drive info`);
    }
  }

  console.log(`  COMPLETE: ${fileName} → ${cleanName}`);

  return {
    success: true,
    documentId: pipelineResult.documentId,
    originalName: fileName,
    newName: cleanName,
    gcsPath: pipelineResult.gcsPath,
    skipped: false,
  };
}
