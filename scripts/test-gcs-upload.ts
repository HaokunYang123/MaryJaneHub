import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { uploadToGCS } from "../lib/gcs/upload.js";

const SAMPLE_PDF_PATH = "test-files/sample-bill.pdf";

async function main(): Promise<void> {
  console.log("=== GCS Upload Test ===\n");

  // Check for required environment variables
  if (!process.env.GCS_BUCKET_NAME) {
    console.error("Missing GCS_BUCKET_NAME environment variable");
    console.error("Please set it in .env.local and try again.");
    process.exit(1);
  }

  console.log(`Bucket: ${process.env.GCS_BUCKET_NAME}\n`);

  // Check if sample PDF exists
  if (!existsSync(SAMPLE_PDF_PATH)) {
    console.error(`Sample PDF not found at: ${SAMPLE_PDF_PATH}`);
    console.error("\nPlease place a sample PDF at this location and try again.");
    process.exit(1);
  }

  console.log(`Reading PDF: ${SAMPLE_PDF_PATH}`);
  const fileBuffer = await readFile(SAMPLE_PDF_PATH);
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");
  console.log(`File size: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
  console.log(`File hash: ${fileHash.slice(0, 16)}...\n`);

  console.log("Uploading to GCS...\n");
  const result = await uploadToGCS(
    fileBuffer,
    "sample-bill.pdf",
    fileHash,
    "application/pdf"
  );

  console.log("=== Upload Result ===\n");
  console.log(`Success: ${result.success}`);
  console.log(`GCS Path: ${result.gcsPath}`);
  if (result.publicUrl) {
    console.log(`Public URL: ${result.publicUrl}`);
  }
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  console.log("\n=== Validation ===\n");

  const pathValid = result.gcsPath.startsWith("gs://");
  console.log(`GCS path starts with "gs://": ${pathValid ? "PASS" : "FAIL"}`);

  if (!result.success || !pathValid) {
    process.exit(1);
  }

  console.log("\n=== Test Complete ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
