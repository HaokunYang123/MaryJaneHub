#!/usr/bin/env npx tsx
/**
 * Comprehensive Performance Benchmark Suite
 *
 * Benchmarks all major system operations:
 * - Document Processing (OCR, Classification, Extraction)
 * - Search (Vector, Hybrid, Embedding)
 * - Database Operations
 * - External APIs
 *
 * Usage:
 *   npm run benchmark           # Full benchmark
 *   npm run benchmark:quick     # Skip slow operations (OCR, external APIs)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import {
  measureTime,
  formatDuration,
  getStatus,
  printPerformanceTable,
  printSummary,
  generateJsonReport,
  type PerformanceReport,
  type PerformanceEntry,
} from "../lib/utils/performance";

// Import functions to benchmark
import { extractWithDocumentAI } from "../lib/document-ai/ocr";
import { classifyDocument } from "../lib/gemini/classify-document";
import { extractDocument } from "../lib/gemini/extract-document";
import { processDocument } from "../lib/pipeline/process-document";
import { generateEmbedding } from "../lib/gemini/embeddings";
import { searchDocuments, hybridSearchDocuments } from "../lib/search/semantic-search";
import { getDocumentById, getSyncStatusSummary, getDocumentsNeedingReview } from "../lib/supabase/documents";
import { getSupabase } from "../lib/supabase/client";
import type { DocumentRecord } from "../lib/supabase/types";
import { listNewFiles } from "../lib/google-drive/list-files";

// Parse command line args
const args = process.argv.slice(2);
const quickMode = args.includes("--quick") || args.includes("-q");

// Sample OCR text for testing (realistic invoice content)
const SAMPLE_OCR_TEXT = `
INVOICE

From: Acme Corporation
123 Business Street
San Francisco, CA 94105

To: Customer Name
456 Client Avenue
New York, NY 10001

Invoice Number: INV-2024-001234
Invoice Date: January 15, 2024
Due Date: February 15, 2024

Description                          Quantity    Unit Price    Amount
---------------------------------------------------------------------------
Professional Consulting Services         40        $150.00     $6,000.00
Software Development                     20        $200.00     $4,000.00
Project Management                       10        $125.00     $1,250.00

                                        Subtotal:              $11,250.00
                                        Tax (8.5%):               $956.25
                                        Total:                 $12,206.25

Payment Terms: Net 30
Please make checks payable to Acme Corporation

Thank you for your business!
`;

const SAMPLE_SHORT_TEXT = "Invoice from Acme Corporation for consulting services.";
const SAMPLE_MEDIUM_TEXT = SAMPLE_OCR_TEXT;
const SAMPLE_LONG_TEXT = SAMPLE_OCR_TEXT.repeat(5);

// Test PDF path
const TEST_PDF_PATH = "test-files/sample-bill.pdf";

async function runBenchmarks(): Promise<PerformanceReport> {
  const report: PerformanceReport = [];

  console.log();
  console.log("═".repeat(60));
  console.log("Performance Benchmark Suite");
  console.log("═".repeat(60));
  console.log();
  console.log(`Mode: ${quickMode ? "Quick (skipping slow operations)" : "Full"}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log();

  // ═══════════════════════════════════════════════════════════════════════════
  // WARMUP: Eliminate cold start effects
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Warming up APIs (eliminates cold start effects)...");
  try {
    // Warmup embedding API
    await generateEmbedding("warmup query");
    // Warmup Supabase connection
    const supabase = getSupabase();
    await supabase.from("documents").select("id").limit(1);
    console.log("  Warmup complete\n");
  } catch {
    console.log("  Warmup failed (continuing anyway)\n");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Document Processing
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Running Document Processing benchmarks...");

  // 1. OCR (Document AI)
  if (!quickMode && existsSync(TEST_PDF_PATH)) {
    try {
      const pdfBuffer = await readFile(TEST_PDF_PATH);
      const { result, durationMs } = await measureTime("OCR", () =>
        extractWithDocumentAI(pdfBuffer, "application/pdf")
      );

      report.push({
        name: "OCR (Document AI)",
        durationMs,
        category: "Processing",
        status: result.success ? getStatus(durationMs, "ocr") : "error",
        error: result.success ? undefined : result.error?.message,
      });
    } catch (error) {
      report.push({
        name: "OCR (Document AI)",
        durationMs: 0,
        category: "Processing",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } else {
    report.push({
      name: "OCR (Document AI)",
      durationMs: 0,
      category: "Processing",
      status: "skipped",
      error: quickMode ? "Skipped in quick mode" : "No test PDF found",
    });
  }

  // 2. Classification (Gemini)
  try {
    const { result, durationMs } = await measureTime("Classification", () =>
      classifyDocument(SAMPLE_OCR_TEXT)
    );

    report.push({
      name: "Classification (Gemini)",
      durationMs,
      category: "Processing",
      status: getStatus(durationMs, "classification"),
    });

    console.log(`  Classification result: ${result.documentType} (${(result.confidence * 100).toFixed(0)}%)`);
  } catch (error) {
    report.push({
      name: "Classification (Gemini)",
      durationMs: 0,
      category: "Processing",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // 3. Extraction (Gemini) - Multiple document types
  const documentTypes = ["invoice", "receipt", "bank_statement"] as const;

  for (const docType of documentTypes) {
    try {
      const { durationMs } = await measureTime(`Extract ${docType}`, () =>
        extractDocument(docType, SAMPLE_OCR_TEXT)
      );

      report.push({
        name: `Extraction: ${docType}`,
        durationMs,
        category: "Processing",
        status: getStatus(durationMs, "extraction"),
      });
    } catch (error) {
      report.push({
        name: `Extraction: ${docType}`,
        durationMs: 0,
        category: "Processing",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // 4. Full Pipeline (if not quick mode and PDF exists)
  if (!quickMode && existsSync(TEST_PDF_PATH)) {
    try {
      const pdfBuffer = await readFile(TEST_PDF_PATH);
      const { result, durationMs } = await measureTime("Full Pipeline", () =>
        processDocument(pdfBuffer, "application/pdf", "benchmark-test.pdf", {
          skipDuplicateCheck: true,
          skipEmbedding: true,
        })
      );

      report.push({
        name: "Full Pipeline (end-to-end)",
        durationMs,
        category: "Processing",
        status: result.status === "success" ? getStatus(durationMs, "ocr") : "error",
        error: result.status !== "success" ? result.error : undefined,
      });
    } catch (error) {
      report.push({
        name: "Full Pipeline (end-to-end)",
        durationMs: 0,
        category: "Processing",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } else {
    report.push({
      name: "Full Pipeline (end-to-end)",
      durationMs: 0,
      category: "Processing",
      status: "skipped",
      error: quickMode ? "Skipped in quick mode" : "No test PDF found",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Search
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Running Search benchmarks...");

  // 5. Embedding Generation - Various text lengths
  const embeddingTests = [
    { name: "short (~50 chars)", text: SAMPLE_SHORT_TEXT },
    { name: "medium (~1KB)", text: SAMPLE_MEDIUM_TEXT },
    { name: "long (~5KB)", text: SAMPLE_LONG_TEXT },
  ];

  for (const test of embeddingTests) {
    try {
      const { result, durationMs } = await measureTime(`Embedding ${test.name}`, () =>
        generateEmbedding(test.text)
      );

      report.push({
        name: `Embedding: ${test.name}`,
        durationMs,
        category: "Search",
        status: result.success ? getStatus(durationMs, "embedding") : "error",
        error: result.success ? undefined : result.error,
      });
    } catch (error) {
      report.push({
        name: `Embedding: ${test.name}`,
        durationMs: 0,
        category: "Search",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // 6. Vector Search
  try {
    const { result, durationMs } = await measureTime("Vector Search", () =>
      searchDocuments("invoice from vendor", { limit: 10, threshold: 0.3 })
    );

    report.push({
      name: "Vector Search",
      durationMs,
      category: "Search",
      status: result.success ? getStatus(durationMs, "search") : "error",
      error: result.success ? undefined : result.error,
    });

    if (result.success) {
      console.log(`  Vector search returned ${result.results.length} results`);
    }
  } catch (error) {
    report.push({
      name: "Vector Search",
      durationMs: 0,
      category: "Search",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // 7. Hybrid Search
  try {
    const { result, durationMs } = await measureTime("Hybrid Search", () =>
      hybridSearchDocuments("invoice services", { limit: 10, minScore: 0.2 })
    );

    report.push({
      name: "Hybrid Search",
      durationMs,
      category: "Search",
      status: result.success ? getStatus(durationMs, "search") : "error",
      error: result.success ? undefined : result.error,
    });

    if (result.success) {
      console.log(`  Hybrid search returned ${result.results.length} results`);
    }
  } catch (error) {
    report.push({
      name: "Hybrid Search",
      durationMs: 0,
      category: "Search",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: Database
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("Running Database benchmarks...");

  // Helper: List documents with limit
  async function listDocuments(limit: number): Promise<DocumentRecord[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to list documents: ${error.message}`);
    }
    return (data || []) as DocumentRecord[];
  }

  // 8. Document Query - List
  let firstDocId: string | null = null;
  try {
    const { result, durationMs } = await measureTime("DB: List Documents", () =>
      listDocuments(20)
    );

    report.push({
      name: "DB: List Documents (limit 20)",
      durationMs,
      category: "Database",
      status: getStatus(durationMs, "database"),
    });

    console.log(`  Listed ${result.length} documents`);

    if (result.length > 0) {
      firstDocId = result[0].id;
    }
  } catch (error) {
    report.push({
      name: "DB: List Documents (limit 20)",
      durationMs: 0,
      category: "Database",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // 9. Document Query - By ID
  if (firstDocId) {
    try {
      const { result, durationMs } = await measureTime("DB: Get by ID", () =>
        getDocumentById(firstDocId!)
      );

      report.push({
        name: "DB: Get Document by ID",
        durationMs,
        category: "Database",
        status: result ? getStatus(durationMs, "database") : "error",
        error: result ? undefined : "Document not found",
      });
    } catch (error) {
      report.push({
        name: "DB: Get Document by ID",
        durationMs: 0,
        category: "Database",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } else {
    report.push({
      name: "DB: Get Document by ID",
      durationMs: 0,
      category: "Database",
      status: "skipped",
      error: "No documents to query",
    });
  }

  // 10. Summary Query
  try {
    const { durationMs } = await measureTime("DB: Summary", () =>
      getSyncStatusSummary()
    );

    report.push({
      name: "DB: Sync Status Summary",
      durationMs,
      category: "Database",
      status: getStatus(durationMs, "database"),
    });
  } catch (error) {
    report.push({
      name: "DB: Sync Status Summary",
      durationMs: 0,
      category: "Database",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // 11. Documents Needing Review Query
  try {
    const { result, durationMs } = await measureTime("DB: Needing Review", () =>
      getDocumentsNeedingReview()
    );

    report.push({
      name: "DB: Documents Needing Review",
      durationMs,
      category: "Database",
      status: getStatus(durationMs, "database"),
    });

    console.log(`  Found ${result.length} documents needing review`);
  } catch (error) {
    report.push({
      name: "DB: Documents Needing Review",
      durationMs: 0,
      category: "Database",
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORY: External APIs
  // ═══════════════════════════════════════════════════════════════════════════
  if (!quickMode) {
    console.log("Running External API benchmarks...");

    // 12. Google Drive - List Files
    const inboxFolderId = process.env.GOOGLE_DRIVE_INBOX_FOLDER_ID;
    if (inboxFolderId) {
      try {
        const { result, durationMs } = await measureTime("Google Drive: List", () =>
          listNewFiles(inboxFolderId)
        );

        report.push({
          name: "Google Drive: List Files",
          durationMs,
          category: "External",
          status: getStatus(durationMs, "external"),
        });

        console.log(`  Found ${result.length} files in inbox`);
      } catch (error) {
        report.push({
          name: "Google Drive: List Files",
          durationMs: 0,
          category: "External",
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } else {
      report.push({
        name: "Google Drive: List Files",
        durationMs: 0,
        category: "External",
        status: "skipped",
        error: "GOOGLE_DRIVE_INBOX_FOLDER_ID not configured",
      });
    }
  } else {
    report.push({
      name: "Google Drive: List Files",
      durationMs: 0,
      category: "External",
      status: "skipped",
      error: "Skipped in quick mode",
    });
  }

  return report;
}

async function main(): Promise<void> {
  const startTime = Date.now();

  try {
    const report = await runBenchmarks();

    console.log();
    printPerformanceTable(report);
    printSummary(report);

    // Save JSON report
    const jsonReport = generateJsonReport(report, {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      quickMode,
    });

    const reportPath = "benchmark-results.json";
    await writeFile(reportPath, JSON.stringify(jsonReport, null, 2));
    console.log(`Report saved to: ${reportPath}`);

    // Calculate pipeline breakdown if available
    const processingEntries = report.filter(
      (e) => e.category === "Processing" && e.status !== "skipped" && e.status !== "error"
    );

    if (processingEntries.length > 1) {
      const totalProcessing = processingEntries.reduce((sum, e) => sum + e.durationMs, 0);

      console.log();
      console.log("Pipeline Breakdown:");
      for (const entry of processingEntries) {
        const percentage = ((entry.durationMs / totalProcessing) * 100).toFixed(1);
        console.log(`  ${entry.name}: ${formatDuration(entry.durationMs)} (${percentage}%)`);
      }
    }

    const totalTime = Date.now() - startTime;
    console.log();
    console.log(`Benchmark completed in ${formatDuration(totalTime)}`);

    // Exit with error code if any critical issues
    const hasCritical = report.some((e) => e.status === "critical");
    const hasErrors = report.some((e) => e.status === "error");

    if (hasCritical || hasErrors) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Benchmark failed:", error);
    process.exit(1);
  }
}

main();
