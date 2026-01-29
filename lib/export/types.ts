/**
 * Export Types
 *
 * Type definitions for the due diligence export system.
 */

export interface ExportOptions {
  // Filters
  documentTypes?: string[];
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  minAmount?: number;
  maxAmount?: number;
  syncStatus?: string[];

  // Output options
  includeRawText?: boolean;
  includeLowConfidence?: boolean; // Include docs with confidence < 0.7
}

export interface DocumentExportRow {
  // Identity
  id: string;
  file_name: string;
  document_type: string;

  // Key extracted data
  date: string | null;
  vendor_name: string | null;
  total_amount: number | null;
  currency: string;

  // Additional type-specific fields
  invoice_number?: string | null;
  payment_method?: string | null;

  // Quality indicators
  ocr_confidence: number;
  classification_confidence: number;
  extraction_confidence: number;

  // Status
  sync_status: string;
  review_flags: string[];

  // Traceability
  drive_file_id: string | null;
  gcs_path: string | null;
  created_at: string;

  // Optional
  raw_text?: string;
}

export interface MonthSummary {
  month: string; // YYYY-MM
  count: number;
  amount: number;
}

export interface IssueReport {
  type:
    | "missing_date"
    | "missing_vendor"
    | "missing_amount"
    | "low_confidence"
    | "needs_review";
  description: string;
  count: number;
  documentIds: string[];
}

export interface SummaryReport {
  generatedAt: string;
  dateRange: {
    from: string | null;
    to: string | null;
  };

  // Counts
  totalDocuments: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byMonth: MonthSummary[];

  // Financials
  totalAmount: number;
  byTypeAmount: Record<string, number>;

  // Quality
  avgConfidence: number;
  lowConfidenceCount: number; // < 0.7
  needsReviewCount: number;

  // Potential issues (for lawyer attention)
  issues: IssueReport[];
}

export interface ExportResult {
  success: boolean;
  format: "csv" | "xlsx" | "json";
  filename: string;
  data?: Buffer | string;
  error?: string;
}
