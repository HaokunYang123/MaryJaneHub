import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { processDocument } from "../lib/pipeline/process-document.js";
import {
  getDocumentByHash,
  getAuditLogs,
} from "../lib/supabase/documents.js";

const SAMPLE_PDF_PATH = "test-files/sample-bill.pdf";

async function main(): Promise<void> {
  console.log("=== Supabase Integration Test ===\n");

  // Check for required environment variables
  const requiredEnvVars = [
    "GOOGLE_CLOUD_PROJECT_ID",
    "DOCUMENT_AI_PROCESSOR_ID",
    "GEMINI_API_KEY",
    "GCS_BUCKET_NAME",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
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

  // Step 1: Run the full pipeline
  console.log("Running full pipeline (OCR -> Gemini -> GCS -> Supabase)...\n");
  const result = await processDocument(
    fileBuffer,
    "application/pdf",
    "sample-bill.pdf"
  );

  console.log("=== Pipeline Result ===\n");
  console.log(`Status: ${result.status}`);
  console.log(`File Hash: ${result.fileHash}`);
  console.log(`GCS Path: ${result.gcsPath || "(not uploaded)"}`);
  console.log(`Document ID: ${result.documentId || "(not saved)"}`);
  console.log(`Vendor: ${result.extraction.vendor}`);
  console.log(`Total: ${result.extraction.total}`);

  // Step 2: Query document back from Supabase
  console.log("\n=== Querying Supabase ===\n");

  const dbDocument = await getDocumentByHash(result.fileHash);

  if (!dbDocument) {
    console.error("FAIL: Document not found in Supabase!");
    process.exit(1);
  }

  console.log("Document found in Supabase:");
  console.log(`  ID: ${dbDocument.id}`);
  console.log(`  File Name: ${dbDocument.file_name}`);
  console.log(`  Status: ${dbDocument.status}`);
  console.log(`  Created At: ${dbDocument.created_at}`);
  console.log(`  Extraction Confidence: ${dbDocument.extraction_confidence}`);
  console.log(`  Vendor: ${dbDocument.extraction.vendor}`);
  console.log(`  Total: ${dbDocument.extraction.total}`);

  // Step 3: Check audit logs
  console.log("\n=== Checking Audit Logs ===\n");

  const auditLogs = await getAuditLogs(dbDocument.id);

  if (auditLogs.length === 0) {
    console.warn("WARNING: No audit logs found for document");
  } else {
    console.log(`Found ${auditLogs.length} audit log(s):`);
    auditLogs.forEach((log, index) => {
      console.log(`  ${index + 1}. Action: ${log.action}, Actor: ${log.actor}, Time: ${log.created_at}`);
      if (log.notes) {
        console.log(`     Notes: ${log.notes}`);
      }
    });
  }

  // Validation
  console.log("\n=== Validation ===\n");

  const pipelineSuccess = result.status === "success";
  const documentSaved = !!result.documentId;
  const documentQueried = !!dbDocument;
  const dataMatches =
    dbDocument.extraction.vendor === result.extraction.vendor &&
    dbDocument.extraction.total === result.extraction.total;
  const auditLogExists = auditLogs.some((log) => log.action === "created");

  console.log(`Pipeline status is 'success': ${pipelineSuccess ? "PASS" : "FAIL"}`);
  console.log(`Document saved to Supabase: ${documentSaved ? "PASS" : "FAIL"}`);
  console.log(`Document queryable by hash: ${documentQueried ? "PASS" : "FAIL"}`);
  console.log(`Extraction data matches: ${dataMatches ? "PASS" : "FAIL"}`);
  console.log(`Audit log 'created' exists: ${auditLogExists ? "PASS" : "FAIL"}`);

  const allPassed =
    pipelineSuccess && documentSaved && documentQueried && dataMatches && auditLogExists;

  console.log(`\nOverall: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);

  if (!allPassed) {
    process.exit(1);
  }

  console.log("\n=== Test Complete ===");

  // Print setup instructions
  console.log("\n" + "=".repeat(60));
  console.log("IMPORTANT: Database Setup Instructions");
  console.log("=".repeat(60));
  console.log(`
If you haven't already, run the following SQL in your Supabase SQL Editor:

1. Go to: ${process.env.SUPABASE_URL?.replace('.supabase.co', '.supabase.co/project/default/sql')}
2. Open: supabase/migrations/001_initial_schema.sql
3. Copy and paste the SQL into the editor
4. Click "Run"

This creates the 'documents' and 'audit_logs' tables.
`);
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
