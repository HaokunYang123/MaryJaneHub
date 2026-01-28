import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { processDocument } from "../lib/pipeline/process-document.js";

const SAMPLE_PDF_PATH = "test-files/sample-bill.pdf";

async function main(): Promise<void> {
  console.log("=== Document Processing Pipeline Test ===\n");

  // Check for required environment variables
  const requiredEnvVars = [
    "GOOGLE_CLOUD_PROJECT_ID",
    "DOCUMENT_AI_PROCESSOR_ID",
    "GEMINI_API_KEY",
    "GCS_BUCKET_NAME",
  ];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.error("Missing required environment variables:");
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error("\nPlease set these in .env.local and try again.");
    process.exit(1);
  }

  // Check if sample PDF exists
  if (!existsSync(SAMPLE_PDF_PATH)) {
    console.error(`Sample PDF not found at: ${SAMPLE_PDF_PATH}`);
    console.error("\nPlease place a sample PDF at this location and try again.");
    process.exit(1);
  }

  console.log(`Reading PDF: ${SAMPLE_PDF_PATH}`);
  const fileBuffer = await readFile(SAMPLE_PDF_PATH);
  console.log(`File size: ${(fileBuffer.length / 1024).toFixed(2)} KB\n`);

  console.log("Processing document through pipeline...\n");
  const result = await processDocument(
    fileBuffer,
    "application/pdf",
    "sample-bill.pdf"
  );

  console.log("=== Pipeline Result ===\n");

  // Metadata
  console.log("--- Metadata ---");
  console.log(`File Name: ${result.fileName}`);
  console.log(`File Hash: ${result.fileHash}`);
  console.log(`Processed At: ${result.processedAt}`);
  console.log(`Status: ${result.status}`);
  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  // OCR
  console.log("\n--- OCR Layer ---");
  console.log(`OCR Confidence: ${(result.ocrConfidence * 100).toFixed(2)}%`);
  console.log(`Raw Text Length: ${result.rawText.length} characters`);

  // Extraction
  console.log("\n--- Extraction Layer ---");
  console.log(`Document Type: ${result.extraction.type}`);
  console.log(`Extraction Confidence: ${(result.extraction.data.confidence * 100).toFixed(1)}%`);

  // Display type-specific extraction data
  const data = result.extraction.data;
  if (result.extraction.type === "invoice" || result.extraction.type === "other") {
    const invoiceData = data as { vendor: string | null; invoice_number: string | null; invoice_date: string | null; due_date: string | null; subtotal: number | null; tax: number | null; total: number | null; line_items: Array<{ description: string; quantity: number | null; unit_price: number | null; amount: number | null }> };
    console.log(`Vendor: ${invoiceData.vendor}`);
    console.log(`Invoice Number: ${invoiceData.invoice_number}`);
    console.log(`Invoice Date: ${invoiceData.invoice_date}`);
    console.log(`Due Date: ${invoiceData.due_date}`);
    console.log(`Subtotal: ${invoiceData.subtotal}`);
    console.log(`Tax: ${invoiceData.tax}`);
    console.log(`Total: ${invoiceData.total}`);
    console.log(`Line Items: ${invoiceData.line_items.length}`);

    if (invoiceData.line_items.length > 0) {
      console.log("\n--- Line Items ---");
      invoiceData.line_items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.description} - Qty: ${item.quantity}, Price: ${item.unit_price}, Amount: ${item.amount}`);
      });
    }
  } else {
    console.log("Extraction Data:", JSON.stringify(data, null, 2));
  }

  // Storage
  console.log("\n--- Storage Layer ---");
  console.log(`GCS Path: ${result.gcsPath || "(not uploaded)"}`);

  // Validation
  console.log("\n=== Validation ===\n");

  const statusPass = result.status === "success";
  const hashPass = /^[a-f0-9]{64}$/.test(result.fileHash);
  const extractionData = result.extraction.data;
  const extractedTotal = "total" in extractionData ? extractionData.total : null;
  const totalPass = extractedTotal === 93.5;
  const gcsPass = result.gcsPath?.startsWith("gs://") ?? false;

  console.log(`Status is 'success': ${statusPass ? "PASS" : "FAIL"} (got: ${result.status})`);
  console.log(`File hash is 64-char hex: ${hashPass ? "PASS" : "FAIL"} (got: ${result.fileHash.length} chars)`);
  console.log(`Total is 93.50: ${totalPass ? "PASS" : "FAIL"} (got: ${extractedTotal})`);
  console.log(`GCS path starts with "gs://": ${gcsPass ? "PASS" : "FAIL"} (got: ${result.gcsPath || "undefined"})`);

  const allPassed = statusPass && hashPass && totalPass && gcsPass;
  console.log(`\nOverall: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);

  if (!allPassed) {
    process.exit(1);
  }

  console.log("\n=== Test Complete ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
