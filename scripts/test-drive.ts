import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { listNewFiles, downloadFile } from "../lib/google-drive/index.js";

async function main(): Promise<void> {
  console.log("=== Google Drive Integration Test ===\n");

  // Check for required environment variables
  const inboxFolderId = process.env.GOOGLE_DRIVE_INBOX_FOLDER_ID;
  const processedFolderId = process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID;

  if (!inboxFolderId) {
    console.error("Missing GOOGLE_DRIVE_INBOX_FOLDER_ID environment variable");
    console.error("Please set it in .env.local and try again.");
    process.exit(1);
  }

  console.log(`Inbox Folder ID: ${inboxFolderId}`);
  console.log(`Processed Folder ID: ${processedFolderId || "(not set)"}\n`);

  // Step 1: List files in INBOX folder
  console.log("=== Listing Files in INBOX ===\n");

  const files = await listNewFiles(inboxFolderId);

  if (files.length === 0) {
    console.log("No files found in INBOX folder.");
    console.log("\nTo test, upload a PDF or image to the INBOX folder.");
    console.log("\n=== Test Complete (no files to process) ===");
    return;
  }

  console.log(`Found ${files.length} file(s):\n`);

  files.forEach((file, index) => {
    const sizeKB = file.size ? (parseInt(file.size) / 1024).toFixed(2) : "unknown";
    console.log(`${index + 1}. ${file.name}`);
    console.log(`   ID: ${file.id}`);
    console.log(`   Type: ${file.mimeType}`);
    console.log(`   Size: ${sizeKB} KB`);
    console.log(`   Created: ${file.createdTime}`);
    console.log();
  });

  // Step 2: Download the first file as a test
  console.log("=== Download Test ===\n");

  const firstFile = files[0];
  console.log(`Downloading: ${firstFile.name}`);

  const downloadResult = await downloadFile(firstFile.id);

  if (!downloadResult.success) {
    console.error(`Download failed: ${downloadResult.error}`);
    process.exit(1);
  }

  const buffer = downloadResult.buffer!;
  console.log(`Download successful!`);
  console.log(`  Size: ${(buffer.length / 1024).toFixed(2)} KB`);
  console.log(`  MIME Type: ${downloadResult.mimeType}`);
  console.log(`  First bytes: ${buffer.slice(0, 20).toString("hex")}...`);

  // Validation
  console.log("\n=== Validation ===\n");

  const listPass = files.length > 0;
  const downloadPass = downloadResult.success && buffer.length > 0;

  console.log(`Files listed: ${listPass ? "PASS" : "FAIL"} (${files.length} files)`);
  console.log(`File downloaded: ${downloadPass ? "PASS" : "FAIL"} (${buffer.length} bytes)`);

  const allPassed = listPass && downloadPass;
  console.log(`\nOverall: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);

  // Note about move test
  console.log("\n=== Note ===");
  console.log("Move test skipped (files are NOT moved in this test).");
  console.log("The move function will be used in the actual processor.");

  console.log("\n=== Test Complete ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
