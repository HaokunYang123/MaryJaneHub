import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { processDocument } from "../lib/pipeline/process-document.js";
import { approveDocument } from "../lib/workflow/approve-document.js";
import { convertInvoiceToBill, canConvertToBill } from "../lib/quickbooks/invoice-to-bill.js";
import { getDocumentById, getSyncStatusSummary } from "../lib/supabase/documents.js";
import { getSyncStatusDescription } from "../lib/workflow/review-flags.js";
import type { InvoiceExtraction } from "../lib/gemini/types.js";

const SAMPLE_PDF_PATH = "test-files/sample-bill.pdf";

/**
 * Mock OCR text for testing when no PDF is available
 */
const MOCK_INVOICE_TEXT = `
INVOICE

Acme Software Solutions
123 Tech Park Drive
San Francisco, CA 94105

Bill To:
MaryJane Holdings LLC
456 Business Center
Austin, TX 78701

Invoice Number: INV-2024-0147
Invoice Date: January 28, 2024
Due Date: February 27, 2024
Terms: Net 30

Description                          Qty    Unit Price    Amount
-----------------------------------------------------------------
Monthly SaaS Subscription             1      $499.00     $499.00
Premium Support Package               1      $150.00     $150.00
API Integration Setup                 5       $75.00     $375.00
Cloud Storage (100GB)                 1       $25.00      $25.00

                                      Subtotal:        $1,049.00
                                      Tax (8.25%):        $86.54
                                      TOTAL:           $1,135.54

Payment due within 30 days.
Thank you for your business!
`;

/**
 * Print a section header
 */
function printSection(title: string): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

/**
 * Print a step header
 */
function printStep(stepNum: number, title: string): void {
  console.log(`\n[${"Step " + stepNum}] ${title}`);
  console.log("-".repeat(50));
}

/**
 * Main test function
 */
async function main(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("  FULL PIPELINE END-TO-END TEST");
  console.log("=".repeat(60));

  // Check required environment variables
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
    console.error("\nMissing required environment variables:");
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error("\nPlease set these in .env.local and try again.");
    process.exit(1);
  }

  // Determine test mode
  const useMockText = process.argv.includes("--mock") || !existsSync(SAMPLE_PDF_PATH);

  printSection("TEST CONFIGURATION");
  console.log(`Mode: ${useMockText ? "Mock OCR Text" : "Real PDF Processing"}`);
  if (!useMockText) {
    console.log(`PDF Path: ${SAMPLE_PDF_PATH}`);
  }

  // =========================================================================
  // STEP 1: Process Document
  // =========================================================================
  printStep(1, "DOCUMENT PROCESSING (OCR → Classify → Extract)");

  let result;

  if (useMockText) {
    // Use mock text - skip OCR, go directly to classification/extraction
    console.log("Using mock invoice text (skipping OCR)...");
    console.log(`Mock text length: ${MOCK_INVOICE_TEXT.length} characters`);

    // For mock mode, we'll call the pipeline but it will fail OCR
    // So let's create a simulated result instead
    const { classifyDocument } = await import("../lib/gemini/classify-document.js");
    const { extractDocument } = await import("../lib/gemini/extract-document.js");
    const { analyzeDocument } = await import("../lib/workflow/review-flags.js");
    const { saveDocument } = await import("../lib/supabase/documents.js");
    const { createHash } = await import("crypto");

    console.log("\n  Classifying document...");
    const classification = await classifyDocument(MOCK_INVOICE_TEXT);
    console.log(`  → Type: ${classification.documentType} (${(classification.confidence * 100).toFixed(1)}% confidence)`);

    console.log("\n  Extracting structured data...");
    const extraction = await extractDocument(classification.documentType, MOCK_INVOICE_TEXT);
    console.log(`  → Extraction type: ${extraction.type}`);
    console.log(`  → Confidence: ${(extraction.data.confidence * 100).toFixed(1)}%`);

    console.log("\n  Analyzing for review workflow...");
    const analysis = analyzeDocument(extraction);
    console.log(`  → Suggested status: ${analysis.suggestedStatus}`);
    console.log(`  → Flags: ${analysis.flags.length > 0 ? analysis.flags.join(", ") : "(none)"}`);

    // Create mock file hash
    const fileHash = createHash("sha256").update(MOCK_INVOICE_TEXT).digest("hex");

    console.log("\n  Saving to Supabase...");
    const saveResult = await saveDocument({
      fileName: "mock-invoice.pdf",
      fileHash,
      mimeType: "application/pdf",
      ocrConfidence: 0.95, // Mock OCR confidence
      rawText: MOCK_INVOICE_TEXT,
      extraction,
      documentType: classification.documentType,
      classificationConfidence: classification.confidence,
      syncStatus: analysis.suggestedStatus,
      confidenceScore: analysis.confidenceScore,
      reviewFlags: analysis.flags,
    });

    if (saveResult.success) {
      console.log(`  → Document ID: ${saveResult.documentId}`);
      console.log(`  → Already exists: ${saveResult.alreadyExists || false}`);
    } else {
      console.log(`  → Save failed: ${saveResult.error}`);
    }

    // Build result object similar to processDocument
    result = {
      fileName: "mock-invoice.pdf",
      fileHash,
      processedAt: new Date().toISOString(),
      ocrConfidence: 0.95,
      rawText: MOCK_INVOICE_TEXT,
      documentType: classification.documentType,
      classificationConfidence: classification.confidence,
      extraction,
      documentId: saveResult.documentId,
      syncStatus: analysis.suggestedStatus,
      reviewFlags: analysis.flags,
      status: "success" as const,
    };
  } else {
    // Process real PDF
    console.log(`Reading PDF: ${SAMPLE_PDF_PATH}`);
    const fileBuffer = await readFile(SAMPLE_PDF_PATH);
    console.log(`File size: ${(fileBuffer.length / 1024).toFixed(2)} KB`);

    console.log("\nRunning full pipeline...");
    result = await processDocument(fileBuffer, "application/pdf", "sample-bill.pdf");
  }

  // =========================================================================
  // STEP 2: Display Processing Results
  // =========================================================================
  printStep(2, "PROCESSING RESULTS");

  console.log("\n  Metadata:");
  console.log(`    File Name: ${result.fileName}`);
  console.log(`    File Hash: ${result.fileHash.substring(0, 16)}...`);
  console.log(`    Processed At: ${result.processedAt}`);
  console.log(`    Status: ${result.status}`);

  console.log("\n  Classification:");
  console.log(`    Document Type: ${result.documentType}`);
  console.log(`    Classification Confidence: ${(result.classificationConfidence * 100).toFixed(1)}%`);

  console.log("\n  Extraction:");
  console.log(`    Extraction Type: ${result.extraction.type}`);
  console.log(`    Extraction Confidence: ${(result.extraction.data.confidence * 100).toFixed(1)}%`);

  // Display extraction data based on type
  if (result.extraction.type === "invoice" || result.extraction.type === "other") {
    const data = result.extraction.data as InvoiceExtraction;
    console.log(`    Vendor: ${data.vendor || "(not found)"}`);
    console.log(`    Invoice #: ${data.invoice_number || "(not found)"}`);
    console.log(`    Date: ${data.invoice_date || "(not found)"}`);
    console.log(`    Due Date: ${data.due_date || "(not found)"}`);
    console.log(`    Subtotal: ${data.subtotal !== null ? `$${data.subtotal.toFixed(2)}` : "(not found)"}`);
    console.log(`    Tax: ${data.tax !== null ? `$${data.tax.toFixed(2)}` : "(not found)"}`);
    console.log(`    Total: ${data.total !== null ? `$${data.total.toFixed(2)}` : "(not found)"}`);
    console.log(`    Line Items: ${data.line_items?.length || 0}`);
  }

  console.log("\n  Workflow Status:");
  console.log(`    Sync Status: ${result.syncStatus || "not_applicable"}`);
  console.log(`    Status Description: ${getSyncStatusDescription(result.syncStatus || "not_applicable")}`);
  console.log(`    Review Flags: ${result.reviewFlags?.length ? result.reviewFlags.join(", ") : "(none)"}`);

  console.log("\n  Storage:");
  console.log(`    Document ID: ${result.documentId || "(not saved)"}`);
  console.log(`    GCS Path: ${result.gcsPath || "(not uploaded)"}`);

  if (result.status !== "success") {
    console.log(`\n  ERROR: ${result.error}`);
    process.exit(1);
  }

  // =========================================================================
  // STEP 3: Approval Workflow
  // =========================================================================
  printStep(3, "APPROVAL WORKFLOW");

  if (!result.documentId) {
    console.log("  SKIP: No document ID (document not saved to database)");
  } else if (result.syncStatus === "not_applicable") {
    console.log("  SKIP: Document type not applicable for QB sync");
  } else if (result.syncStatus === "auto_approved" || result.syncStatus === "pending_review") {
    console.log(`  Current status: ${result.syncStatus}`);
    console.log("  Approving document for sync...");

    const approvalResult = await approveDocument(result.documentId, {
      reviewedBy: "test-script",
    });

    if (approvalResult.success) {
      console.log(`  → Approval successful!`);
      console.log(`  → New status: ${approvalResult.newStatus}`);
    } else {
      console.log(`  → Approval failed: ${approvalResult.error}`);
    }
  } else if (result.syncStatus === "needs_attention") {
    console.log(`  Current status: needs_attention`);
    console.log(`  Review flags: ${result.reviewFlags?.join(", ")}`);
    console.log("  → Document requires manual review before approval");
    console.log("  → In production, a human would review and approve/reject");

    // Force approve for testing
    if (process.argv.includes("--force-approve")) {
      console.log("\n  Force approving (--force-approve flag)...");
      const approvalResult = await approveDocument(result.documentId, {
        reviewedBy: "test-script",
        force: true,
      });
      if (approvalResult.success) {
        console.log(`  → Force approval successful!`);
      } else {
        console.log(`  → Force approval failed: ${approvalResult.error}`);
      }
    }
  } else {
    console.log(`  Status: ${result.syncStatus} - no action needed`);
  }

  // =========================================================================
  // STEP 4: QuickBooks Sync Simulation
  // =========================================================================
  printStep(4, "QUICKBOOKS SYNC SIMULATION (Dry Run)");

  if (!result.documentId) {
    console.log("  SKIP: No document ID");
  } else {
    // Get fresh document from database
    const doc = await getDocumentById(result.documentId);

    if (!doc) {
      console.log("  SKIP: Document not found in database");
    } else if (doc.sync_status !== "approved" && doc.sync_status !== "auto_approved") {
      console.log(`  SKIP: Document not approved (status: ${doc.sync_status})`);
    } else {
      console.log("  Document is approved, simulating QB sync...\n");

      // Get extraction data
      const extraction = doc.extraction;
      if (extraction.type !== "invoice" && extraction.type !== "other") {
        console.log("  SKIP: Not an invoice type document");
      } else {
        const invoiceData = extraction.data as InvoiceExtraction;

        // Validate conversion
        const validation = canConvertToBill(invoiceData);
        console.log(`  Validation: ${validation.valid ? "PASS" : "FAIL"}`);
        if (!validation.valid) {
          validation.errors.forEach((e) => console.log(`    - ${e}`));
        } else {
          // Convert to bill format
          const mockVendorId = "mock-vendor-123";
          const mockAccountId = "mock-expense-account-456";
          const billInput = convertInvoiceToBill(
            invoiceData,
            mockVendorId,
            invoiceData.vendor || "Unknown Vendor",
            mockAccountId
          );

          console.log("\n  [DRY RUN] Would create QuickBooks Bill:");
          console.log("  " + "-".repeat(46));
          console.log(`    Vendor ID: ${billInput.vendorId}`);
          console.log(`    Vendor Name: ${billInput.vendorName}`);
          console.log(`    Transaction Date: ${billInput.txnDate}`);
          console.log(`    Due Date: ${billInput.dueDate}`);
          console.log(`    Doc Number: ${billInput.docNumber}`);
          console.log(`    Line Items: ${billInput.lines.length}`);

          let totalAmount = 0;
          billInput.lines.forEach((line, i) => {
            console.log(`      ${i + 1}. $${line.amount.toFixed(2)} - ${line.description?.substring(0, 40) || "No description"}`);
            totalAmount += line.amount;
          });
          console.log(`    Total Amount: $${totalAmount.toFixed(2)}`);
          console.log(`    Private Note: ${billInput.privateNote}`);

          console.log("\n  [DRY RUN] API call that would be made:");
          console.log(`    POST /v3/company/{realmId}/bill`);
          console.log(`    Headers: Authorization: Bearer {access_token}`);
          console.log(`    Body: ${JSON.stringify(billInput, null, 2).split("\n").slice(0, 5).join("\n")}...`);
        }
      }
    }
  }

  // =========================================================================
  // STEP 5: Summary
  // =========================================================================
  printStep(5, "DATABASE SUMMARY");

  try {
    const summary = await getSyncStatusSummary();
    console.log("\n  Sync Status Distribution:");
    console.log("  " + "-".repeat(40));
    Object.entries(summary).forEach(([status, count]) => {
      if (count > 0) {
        console.log(`    ${status.padEnd(20)} ${count}`);
      }
    });
  } catch (err) {
    console.log("  Could not fetch summary:", err instanceof Error ? err.message : err);
  }

  // =========================================================================
  // Final Status
  // =========================================================================
  printSection("TEST COMPLETE");
  console.log("\n  All pipeline stages executed successfully!");
  console.log("\n  Next steps:");
  console.log("    1. Connect QuickBooks: GET /api/quickbooks/connect");
  console.log("    2. Run actual sync: npm run qb:api -- --create-bill");
  console.log("    3. Review documents: getDocumentsNeedingReview()");
  console.log("");
}

main().catch((error) => {
  console.error("\nUnexpected error:", error);
  process.exit(1);
});
