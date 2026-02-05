/**
 * Due Diligence Export System
 *
 * Comprehensive export functionality for lawyer review.
 * Supports CSV, Excel, and JSON formats with filtering and summary reports.
 */

import { getSupabase } from "../supabase/client";
import ExcelJS from "exceljs";
import type {
  ExportOptions,
  DocumentExportRow,
  SummaryReport,
  MonthSummary,
  IssueReport,
} from "./types";

interface DBDocument {
  id: string;
  file_name: string;
  document_type: string;
  ocr_confidence: number | null;
  classification_confidence: number | null;
  extraction_confidence: number | null;
  extraction: {
    type: string;
    data: Record<string, unknown>;
  };
  sync_status: string | null;
  review_flags: string[] | null;
  drive_file_id: string | null;
  gcs_path: string | null;
  created_at: string;
  raw_text: string | null;
}

/**
 * Extract date from document based on type
 */
function extractDate(doc: DBDocument): string | null {
  const data = doc.extraction?.data || {};
  return (
    (data.date as string) ||
    (data.invoice_date as string) ||
    (data.statement_period_end as string) ||
    (data.effective_date as string) ||
    null
  );
}

/**
 * Extract vendor/merchant name based on document type
 */
function extractVendorName(doc: DBDocument): string | null {
  const data = doc.extraction?.data || {};
  return (
    (data.vendor as string) ||
    (data.merchant_name as string) ||
    (data.bank_name as string) ||
    (data.sender_organization as string) ||
    null
  );
}

/**
 * Extract total amount based on document type
 */
function extractAmount(doc: DBDocument): number | null {
  const data = doc.extraction?.data || {};
  const amount =
    doc.document_type === "bank_statement"
      ? (data.closing_balance as number | null)
      : (data.total as number | null);
  return amount !== undefined && amount !== null && !isNaN(amount) ? amount : null;
}

/**
 * Query documents with filters
 */
export async function queryDocumentsForExport(
  options: ExportOptions = {}
): Promise<DocumentExportRow[]> {
  const supabase = getSupabase();

  let query = supabase.from("documents").select(`
    id,
    file_name,
    document_type,
    ocr_confidence,
    classification_confidence,
    extraction_confidence,
    extraction,
    sync_status,
    review_flags,
    drive_file_id,
    gcs_path,
    created_at,
    raw_text
  `);

  // Filter by document types
  if (options.documentTypes?.length) {
    query = query.in("document_type", options.documentTypes);
  }

  // Filter by sync status
  if (options.syncStatus?.length) {
    query = query.in("sync_status", options.syncStatus);
  }

  // Filter by confidence
  if (!options.includeLowConfidence) {
    query = query.gte("extraction_confidence", 0.7);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to query documents: ${error.message}`);
  }

  const docs = data as DBDocument[];

  // Apply date and amount filters in memory (extraction fields)
  let filtered = docs;

  if (options.dateFrom || options.dateTo) {
    filtered = filtered.filter((doc) => {
      const date = extractDate(doc);
      if (!date) return options.includeLowConfidence; // Keep if including incomplete
      if (options.dateFrom && date < options.dateFrom) return false;
      if (options.dateTo && date > options.dateTo) return false;
      return true;
    });
  }

  if (options.minAmount !== undefined || options.maxAmount !== undefined) {
    filtered = filtered.filter((doc) => {
      const amount = extractAmount(doc);
      if (amount === null) return options.includeLowConfidence;
      if (options.minAmount !== undefined && amount < options.minAmount) return false;
      if (options.maxAmount !== undefined && amount > options.maxAmount) return false;
      return true;
    });
  }

  // Transform to export rows
  return filtered.map((doc) => {
    const data = doc.extraction?.data || {};
    const row: DocumentExportRow = {
      id: doc.id,
      file_name: doc.file_name,
      document_type: doc.document_type,
      date: extractDate(doc),
      vendor_name: extractVendorName(doc),
      total_amount: extractAmount(doc),
      currency: "USD",
      invoice_number: (data.invoice_number as string) || null,
      payment_method: (data.payment_method as string) || null,
      ocr_confidence: doc.ocr_confidence || 0,
      classification_confidence: doc.classification_confidence || 0,
      extraction_confidence: doc.extraction_confidence || 0,
      sync_status: doc.sync_status || "not_applicable",
      review_flags: doc.review_flags || [],
      drive_file_id: doc.drive_file_id,
      gcs_path: doc.gcs_path,
      created_at: doc.created_at,
    };

    if (options.includeRawText) {
      row.raw_text = doc.raw_text || undefined;
    }

    return row;
  });
}

/**
 * Generate summary report
 */
export async function generateSummaryReport(
  options: ExportOptions = {}
): Promise<SummaryReport> {
  // Get all documents (including low confidence for issue detection)
  const allDocs = await queryDocumentsForExport({
    ...options,
    includeLowConfidence: true,
  });

  // Basic counts
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byTypeAmount: Record<string, number> = {};
  const monthlyData: Record<string, { count: number; amount: number }> = {};

  let totalAmount = 0;
  let totalConfidence = 0;
  let lowConfidenceCount = 0;
  let needsReviewCount = 0;

  // Issue tracking
  const missingDate: string[] = [];
  const missingVendor: string[] = [];
  const missingAmount: string[] = [];
  const lowConfidence: string[] = [];
  const needsReview: string[] = [];

  // Process each document
  for (const doc of allDocs) {
    // By type
    byType[doc.document_type] = (byType[doc.document_type] || 0) + 1;

    // By status
    byStatus[doc.sync_status] = (byStatus[doc.sync_status] || 0) + 1;

    // Amounts
    if (doc.total_amount !== null) {
      totalAmount += doc.total_amount;
      byTypeAmount[doc.document_type] =
        (byTypeAmount[doc.document_type] || 0) + doc.total_amount;
    }

    // Monthly breakdown
    if (doc.date) {
      const month = doc.date.slice(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { count: 0, amount: 0 };
      }
      monthlyData[month].count++;
      monthlyData[month].amount += doc.total_amount || 0;
    }

    // Confidence
    totalConfidence += doc.extraction_confidence;
    if (doc.extraction_confidence < 0.7) {
      lowConfidenceCount++;
      lowConfidence.push(doc.id);
    }

    // Review flags
    if (doc.review_flags?.length > 0) {
      needsReviewCount++;
      needsReview.push(doc.id);
    }

    // Track issues
    if (!doc.date) missingDate.push(doc.id);
    if (!doc.vendor_name) missingVendor.push(doc.id);
    if (doc.total_amount === null) missingAmount.push(doc.id);
  }

  // Build monthly summary sorted by month
  const byMonth: MonthSummary[] = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      count: data.count,
      amount: Math.round(data.amount * 100) / 100,
    }));

  // Get date range
  const dates = allDocs.map((d) => d.date).filter(Boolean) as string[];
  dates.sort();

  // Build issues array
  const issues: IssueReport[] = [];

  if (missingDate.length > 0) {
    issues.push({
      type: "missing_date",
      description: "Documents without a valid date",
      count: missingDate.length,
      documentIds: missingDate,
    });
  }

  if (missingVendor.length > 0) {
    issues.push({
      type: "missing_vendor",
      description: "Documents without vendor/merchant name",
      count: missingVendor.length,
      documentIds: missingVendor,
    });
  }

  if (missingAmount.length > 0) {
    issues.push({
      type: "missing_amount",
      description: "Documents without a total amount",
      count: missingAmount.length,
      documentIds: missingAmount,
    });
  }

  if (lowConfidence.length > 0) {
    issues.push({
      type: "low_confidence",
      description: "Documents with extraction confidence below 70%",
      count: lowConfidence.length,
      documentIds: lowConfidence,
    });
  }

  if (needsReview.length > 0) {
    issues.push({
      type: "needs_review",
      description: "Documents flagged for human review",
      count: needsReview.length,
      documentIds: needsReview,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: dates[0] || null,
      to: dates[dates.length - 1] || null,
    },
    totalDocuments: allDocs.length,
    byType,
    byStatus,
    byMonth,
    totalAmount: Math.round(totalAmount * 100) / 100,
    byTypeAmount: Object.fromEntries(
      Object.entries(byTypeAmount).map(([k, v]) => [k, Math.round(v * 100) / 100])
    ),
    avgConfidence:
      allDocs.length > 0
        ? Math.round((totalConfidence / allDocs.length) * 1000) / 1000
        : 0,
    lowConfidenceCount,
    needsReviewCount,
    issues,
  };
}

/**
 * Export to CSV string
 */
export async function exportToCSV(options: ExportOptions = {}): Promise<string> {
  const docs = await queryDocumentsForExport(options);

  if (docs.length === 0) {
    return "No documents found matching criteria";
  }

  // CSV headers
  const headers = [
    "ID",
    "File Name",
    "Document Type",
    "Date",
    "Vendor/Merchant",
    "Total Amount",
    "Currency",
    "Invoice Number",
    "Payment Method",
    "OCR Confidence",
    "Classification Confidence",
    "Extraction Confidence",
    "Sync Status",
    "Review Flags",
    "Drive File ID",
    "GCS Path",
    "Created At",
  ];

  if (options.includeRawText) {
    headers.push("Raw Text");
  }

  // Escape CSV value
  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // Build rows
  const rows = docs.map((doc) => {
    const row = [
      doc.id,
      doc.file_name,
      doc.document_type,
      doc.date,
      doc.vendor_name,
      doc.total_amount,
      doc.currency,
      doc.invoice_number,
      doc.payment_method,
      doc.ocr_confidence.toFixed(3),
      doc.classification_confidence.toFixed(3),
      doc.extraction_confidence.toFixed(3),
      doc.sync_status,
      doc.review_flags.join("; "),
      doc.drive_file_id,
      doc.gcs_path,
      doc.created_at,
    ];

    if (options.includeRawText) {
      row.push(doc.raw_text);
    }

    return row.map(escapeCSV).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export const __test__ = {
  extractDate,
  extractAmount,
};

/**
 * Export to Excel workbook
 */
export async function exportToExcel(options: ExportOptions = {}): Promise<Buffer> {
  const docs = await queryDocumentsForExport({ ...options, includeLowConfidence: true });
  const summary = await generateSummaryReport(options);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MaryJane Hub Document AI";
  workbook.created = new Date();

  // Style definitions
  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } },
    alignment: { horizontal: "center" },
  };

  const currencyFormat = "$#,##0.00";
  const percentFormat = "0.0%";
  const dateFormat = "yyyy-mm-dd";

  // ==================== Sheet 1: Executive Summary ====================
  const summarySheet = workbook.addWorksheet("Executive Summary");
  summarySheet.columns = [
    { width: 30 },
    { width: 20 },
    { width: 20 },
  ];

  // Title
  summarySheet.addRow(["Due Diligence Export Report"]);
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.addRow([`Generated: ${new Date().toLocaleString()}`]);
  summarySheet.addRow([]);

  // Overview
  summarySheet.addRow(["OVERVIEW"]).font = { bold: true, size: 12 };
  summarySheet.addRow(["Total Documents", summary.totalDocuments]);
  summarySheet.addRow(["Date Range", `${summary.dateRange.from || "N/A"} to ${summary.dateRange.to || "N/A"}`]);
  summarySheet.addRow(["Total Amount", summary.totalAmount]);
  summarySheet.getRow(summarySheet.rowCount).getCell(2).numFmt = currencyFormat;
  summarySheet.addRow([]);

  // By Type
  summarySheet.addRow(["DOCUMENTS BY TYPE"]).font = { bold: true, size: 12 };
  Object.entries(summary.byType).forEach(([type, count]) => {
    const amount = summary.byTypeAmount[type] || 0;
    summarySheet.addRow([type, count, amount]);
    summarySheet.getRow(summarySheet.rowCount).getCell(3).numFmt = currencyFormat;
  });
  summarySheet.addRow([]);

  // Quality Metrics
  summarySheet.addRow(["QUALITY METRICS"]).font = { bold: true, size: 12 };
  summarySheet.addRow(["Average Confidence", summary.avgConfidence]);
  summarySheet.getRow(summarySheet.rowCount).getCell(2).numFmt = percentFormat;
  summarySheet.addRow(["Low Confidence Documents", summary.lowConfidenceCount]);
  summarySheet.addRow(["Needs Review", summary.needsReviewCount]);
  summarySheet.addRow([]);

  // Issues
  if (summary.issues.length > 0) {
    summarySheet.addRow(["ISSUES REQUIRING ATTENTION"]).font = { bold: true, size: 12, color: { argb: "FFFF0000" } };
    summary.issues.forEach((issue) => {
      summarySheet.addRow([issue.description, issue.count]);
    });
  }

  // ==================== Sheet 2: All Documents ====================
  const allDocsSheet = workbook.addWorksheet("All Documents");
  const allDocsHeaders = [
    "ID", "File Name", "Type", "Date", "Vendor/Merchant", "Amount",
    "OCR Conf", "Class Conf", "Extract Conf", "Status", "Review Flags", "Created"
  ];

  const headerRow = allDocsSheet.addRow(allDocsHeaders);
  headerRow.eachCell((cell) => {
    cell.style = headerStyle;
  });

  allDocsSheet.columns = [
    { width: 36 }, // ID
    { width: 50 }, // File Name
    { width: 15 }, // Type
    { width: 12 }, // Date
    { width: 30 }, // Vendor
    { width: 12 }, // Amount
    { width: 10 }, // OCR
    { width: 10 }, // Class
    { width: 10 }, // Extract
    { width: 15 }, // Status
    { width: 20 }, // Flags
    { width: 20 }, // Created
  ];

  docs.forEach((doc) => {
    const row = allDocsSheet.addRow([
      doc.id,
      doc.file_name,
      doc.document_type,
      doc.date,
      doc.vendor_name,
      doc.total_amount,
      doc.ocr_confidence,
      doc.classification_confidence,
      doc.extraction_confidence,
      doc.sync_status,
      doc.review_flags.join(", "),
      doc.created_at.split("T")[0],
    ]);
    row.getCell(6).numFmt = currencyFormat;
    row.getCell(7).numFmt = percentFormat;
    row.getCell(8).numFmt = percentFormat;
    row.getCell(9).numFmt = percentFormat;
  });

  // Auto-filter
  allDocsSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: docs.length + 1, column: allDocsHeaders.length },
  };

  // ==================== Sheet 3: Receipts ====================
  const receipts = docs.filter((d) => d.document_type === "receipt");
  if (receipts.length > 0) {
    const receiptSheet = workbook.addWorksheet("Receipts");
    const receiptHeaders = ["Date", "Merchant", "Amount", "Payment Method", "File Name", "Confidence"];

    const rHeaderRow = receiptSheet.addRow(receiptHeaders);
    rHeaderRow.eachCell((cell) => { cell.style = headerStyle; });

    receiptSheet.columns = [
      { width: 12 }, { width: 35 }, { width: 12 }, { width: 15 }, { width: 50 }, { width: 12 }
    ];

    receipts.forEach((doc) => {
      const row = receiptSheet.addRow([
        doc.date,
        doc.vendor_name,
        doc.total_amount,
        doc.payment_method,
        doc.file_name,
        doc.extraction_confidence,
      ]);
      row.getCell(3).numFmt = currencyFormat;
      row.getCell(6).numFmt = percentFormat;
    });
  }

  // ==================== Sheet 4: Invoices ====================
  const invoices = docs.filter((d) => d.document_type === "invoice");
  if (invoices.length > 0) {
    const invoiceSheet = workbook.addWorksheet("Invoices");
    const invoiceHeaders = ["Date", "Vendor", "Invoice #", "Amount", "Status", "File Name", "Confidence"];

    const iHeaderRow = invoiceSheet.addRow(invoiceHeaders);
    iHeaderRow.eachCell((cell) => { cell.style = headerStyle; });

    invoiceSheet.columns = [
      { width: 12 }, { width: 35 }, { width: 15 }, { width: 12 }, { width: 15 }, { width: 50 }, { width: 12 }
    ];

    invoices.forEach((doc) => {
      const row = invoiceSheet.addRow([
        doc.date,
        doc.vendor_name,
        doc.invoice_number,
        doc.total_amount,
        doc.sync_status,
        doc.file_name,
        doc.extraction_confidence,
      ]);
      row.getCell(4).numFmt = currencyFormat;
      row.getCell(7).numFmt = percentFormat;
    });
  }

  // ==================== Sheet 5: Bank Statements ====================
  const bankStatements = docs.filter((d) => d.document_type === "bank_statement");
  if (bankStatements.length > 0) {
    const bankSheet = workbook.addWorksheet("Bank Statements");
    const bankHeaders = ["Period End", "Bank", "Amount", "File Name", "Confidence"];

    const bHeaderRow = bankSheet.addRow(bankHeaders);
    bHeaderRow.eachCell((cell) => { cell.style = headerStyle; });

    bankSheet.columns = [
      { width: 12 }, { width: 30 }, { width: 15 }, { width: 50 }, { width: 12 }
    ];

    bankStatements.forEach((doc) => {
      const row = bankSheet.addRow([
        doc.date,
        doc.vendor_name,
        doc.total_amount,
        doc.file_name,
        doc.extraction_confidence,
      ]);
      row.getCell(3).numFmt = currencyFormat;
      row.getCell(5).numFmt = percentFormat;
    });
  }

  // ==================== Sheet 6: Issues & Flags ====================
  const issuesDocs = docs.filter(
    (d) => d.extraction_confidence < 0.7 || d.review_flags.length > 0 || !d.date || !d.vendor_name
  );

  if (issuesDocs.length > 0) {
    const issuesSheet = workbook.addWorksheet("Issues & Flags");
    const issuesHeaders = ["File Name", "Type", "Issue", "Confidence", "Review Flags"];

    const issHeaderRow = issuesSheet.addRow(issuesHeaders);
    issHeaderRow.eachCell((cell) => { cell.style = headerStyle; });

    issuesSheet.columns = [
      { width: 50 }, { width: 15 }, { width: 30 }, { width: 12 }, { width: 30 }
    ];

    issuesDocs.forEach((doc) => {
      const issues: string[] = [];
      if (!doc.date) issues.push("Missing date");
      if (!doc.vendor_name) issues.push("Missing vendor");
      if (doc.total_amount === null) issues.push("Missing amount");
      if (doc.extraction_confidence < 0.7) issues.push("Low confidence");

      const row = issuesSheet.addRow([
        doc.file_name,
        doc.document_type,
        issues.join(", ") || "Review flags",
        doc.extraction_confidence,
        doc.review_flags.join(", "),
      ]);
      row.getCell(4).numFmt = percentFormat;

      // Highlight low confidence
      if (doc.extraction_confidence < 0.7) {
        row.getCell(4).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFCCCC" },
        };
      }
    });
  }

  // ==================== Sheet 7: Monthly Summary ====================
  if (summary.byMonth.length > 0) {
    const monthlySheet = workbook.addWorksheet("Monthly Summary");
    const monthlyHeaders = ["Month", "Document Count", "Total Amount"];

    const mHeaderRow = monthlySheet.addRow(monthlyHeaders);
    mHeaderRow.eachCell((cell) => { cell.style = headerStyle; });

    monthlySheet.columns = [
      { width: 15 }, { width: 18 }, { width: 18 }
    ];

    summary.byMonth.forEach((m) => {
      const row = monthlySheet.addRow([m.month, m.count, m.amount]);
      row.getCell(3).numFmt = currencyFormat;
    });

    // Add totals row
    const totalRow = monthlySheet.addRow([
      "TOTAL",
      summary.totalDocuments,
      summary.totalAmount,
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(3).numFmt = currencyFormat;
  }

  // Write to buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Re-export types
export type { ExportOptions, DocumentExportRow, SummaryReport } from "./types";
