import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { processAllInboxFiles } from "../lib/workflow/process-inbox.js";
import { listNewFiles } from "../lib/google-drive/list-files.js";

async function main(): Promise<void> {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           FULL WORKFLOW TEST - INBOX PROCESSING            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  // Check for required environment variables
  const requiredEnvVars = [
    "GOOGLE_CLOUD_PROJECT_ID",
    "DOCUMENT_AI_PROCESSOR_ID",
    "GEMINI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
    "GOOGLE_DRIVE_INBOX_FOLDER_ID",
    "GOOGLE_DRIVE_PROCESSED_FOLDER_ID",
  ];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);
  const bucketName =
    process.env.GCS_ARCHIVE_BUCKET_NAME || process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    missingVars.push("GCS_ARCHIVE_BUCKET_NAME");
  }

  if (missingVars.length > 0) {
    console.error("Missing required environment variables:");
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error("\nPlease set these in .env.local and try again.");
    process.exit(1);
  }

  // Run the full workflow
  const result = await processAllInboxFiles();

  // Print detailed results
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                    DETAILED RESULTS                        ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  if (result.results.length === 0) {
    console.log("No files were processed.\n");
  } else {
    result.results.forEach((r, index) => {
      console.log(`${index + 1}. ${r.originalName}`);
      if (r.success) {
        if (r.skipped) {
          console.log(`   Status: SKIPPED (already processed)`);
        } else {
          console.log(`   Status: SUCCESS`);
        }
        console.log(`   New name: ${r.newName}`);
        console.log(`   Document ID: ${r.documentId}`);
        if (r.gcsPath) {
          console.log(`   GCS Path: ${r.gcsPath}`);
        }
      } else {
        console.log(`   Status: FAILED`);
        console.log(`   Error: ${r.error}`);
      }
      console.log();
    });
  }

  // Verify files were moved to Processed folder
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║              VERIFICATION - PROCESSED FOLDER               ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const processedFolderId = process.env.GOOGLE_DRIVE_PROCESSED_FOLDER_ID!;
  const processedFiles = await listNewFiles(processedFolderId, false);

  console.log(`Files in Processed folder: ${processedFiles.length}\n`);

  if (processedFiles.length > 0) {
    // Show most recent files (last 5)
    const recentFiles = processedFiles.slice(-5);
    console.log("Recent files:");
    recentFiles.forEach((file) => {
      console.log(`  - ${file.name}`);
      console.log(`    Created: ${file.createdTime}`);
    });
  }

  // Final summary
  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                      FINAL SUMMARY                         ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  console.log(`Total files in INBOX:  ${result.total}`);
  console.log(`Successfully processed: ${result.processed}`);
  console.log(`Skipped (duplicates):   ${result.skipped}`);
  console.log(`Failed:                 ${result.failed}`);

  const allSuccess = result.failed === 0;
  console.log(`\nOverall: ${allSuccess ? "ALL OPERATIONS SUCCESSFUL" : "SOME OPERATIONS FAILED"}`);

  if (!allSuccess) {
    process.exit(1);
  }

  console.log("\n=== Workflow Test Complete ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
