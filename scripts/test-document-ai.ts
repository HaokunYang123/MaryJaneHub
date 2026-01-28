import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { extractWithDocumentAI } from "../lib/document-ai/ocr.js";
import type { DetectedTable } from "../lib/document-ai/types.js";

const SAMPLE_PDF_PATH = "test-files/sample-bill.pdf";

/**
 * Format a table for console output
 */
function formatTable(table: DetectedTable, index: number): string {
  const lines: string[] = [];
  lines.push(`\n--- Table ${index + 1} (Page ${table.pageNumber}) ---`);
  lines.push(`Dimensions: ${table.rowCount} rows × ${table.columnCount} columns`);

  if (table.headerRows.length > 0) {
    lines.push("\nHeader:");
    table.headerRows.forEach((row) => {
      const cellTexts = row.cells.map((cell) => cell.text || "(empty)");
      lines.push(`  | ${cellTexts.join(" | ")} |`);
    });
  }

  if (table.bodyRows.length > 0) {
    lines.push("\nBody:");
    table.bodyRows.forEach((row) => {
      const cellTexts = row.cells.map((cell) => cell.text || "(empty)");
      lines.push(`  | ${cellTexts.join(" | ")} |`);
    });
  }

  return lines.join("\n");
}

async function main(): Promise<void> {
  console.log("=== Document AI OCR Test ===\n");

  // Check for required environment variables
  const requiredEnvVars = [
    "GOOGLE_CLOUD_PROJECT_ID",
    "DOCUMENT_AI_PROCESSOR_ID",
  ];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.error("Missing required environment variables:");
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error("\nPlease set these variables and try again.");
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

  console.log("Processing with Document AI...\n");
  const result = await extractWithDocumentAI(fileBuffer, "application/pdf");

  if (!result.success) {
    console.error("OCR Failed!");
    console.error(`Error code: ${result.error.code}`);
    console.error(`Message: ${result.error.message}`);
    if (result.error.details) {
      console.error(`Details: ${result.error.details}`);
    }
    process.exit(1);
  }

  // Print results
  console.log("=== OCR Results ===\n");

  console.log(`Pages: ${result.pages}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(2)}%`);
  console.log(`Tables detected: ${result.tables.length}`);

  console.log("\n=== Extracted Text ===\n");
  console.log(result.rawText || "(No text extracted)");

  if (result.tables.length > 0) {
    console.log("\n=== Detected Tables ===");
    result.tables.forEach((table, index) => {
      console.log(formatTable(table, index));
    });
  }

  console.log("\n=== Test Complete ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
