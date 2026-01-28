import type { DocumentExtraction } from "../gemini/extract-document";

/**
 * Flags that indicate a document needs manual review
 */
export type ReviewFlag =
  | "vendor_not_found"
  | "high_amount"
  | "missing_field"
  | "duplicate_invoice"
  | "low_confidence";

/**
 * Sync status for invoice documents
 */
export type SyncStatus =
  | "not_applicable" // Non-invoice documents
  | "auto_approved" // High confidence, no flags - can sync automatically
  | "pending_review" // Medium confidence, no flags - needs quick review
  | "needs_attention" // Has flags - needs careful review
  | "approved" // Manually approved, ready to sync
  | "rejected" // Rejected, won't sync
  | "synced" // Successfully synced to QuickBooks
  | "error"; // Sync failed

/**
 * Result of document analysis
 */
export interface AnalysisResult {
  flags: ReviewFlag[];
  details: Partial<Record<ReviewFlag, string>>;
  suggestedStatus: SyncStatus;
  confidenceScore: number;
}

/**
 * Options for document analysis
 */
export interface AnalysisOptions {
  /** Amount threshold for high_amount flag (default: 10000) */
  amountThreshold?: number;
  /** Known vendor names for vendor matching (optional) */
  knownVendors?: string[];
  /** Existing invoice numbers for duplicate detection (optional) */
  existingInvoiceNumbers?: string[];
}

/**
 * Analyze a document extraction and determine review flags and suggested status
 *
 * @param extraction - The document extraction result
 * @param options - Analysis options
 * @returns Analysis result with flags, details, and suggested status
 */
export function analyzeDocument(
  extraction: DocumentExtraction,
  options: AnalysisOptions = {}
): AnalysisResult {
  const { amountThreshold = 10000, knownVendors, existingInvoiceNumbers } = options;

  const flags: ReviewFlag[] = [];
  const details: Partial<Record<ReviewFlag, string>> = {};

  // Get confidence score
  const confidenceScore = extraction.data.confidence;

  // Only analyze invoice-type documents for QB sync
  if (extraction.type !== "invoice" && extraction.type !== "other") {
    return {
      flags: [],
      details: {},
      suggestedStatus: "not_applicable",
      confidenceScore,
    };
  }

  const data = extraction.data as {
    vendor: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
    total: number | null;
    confidence: number;
  };

  // Rule 1: Low confidence
  if (confidenceScore < 0.8) {
    flags.push("low_confidence");
    details.low_confidence = `Extraction confidence is ${(confidenceScore * 100).toFixed(1)}% (below 80% threshold)`;
  }

  // Rule 2: High amount
  if (data.total !== null && data.total > amountThreshold) {
    flags.push("high_amount");
    details.high_amount = `Invoice total $${data.total.toFixed(2)} exceeds $${amountThreshold} threshold`;
  }

  // Rule 3: Missing required fields
  const missingFields: string[] = [];
  if (!data.vendor || data.vendor.trim() === "") {
    missingFields.push("vendor");
  }
  if (!data.invoice_date) {
    missingFields.push("invoice_date");
  }
  if (data.total === null) {
    missingFields.push("total");
  }

  if (missingFields.length > 0) {
    flags.push("missing_field");
    details.missing_field = `Missing required fields: ${missingFields.join(", ")}`;
  }

  // Rule 4: Vendor not found (if known vendors provided)
  if (knownVendors && knownVendors.length > 0 && data.vendor) {
    const vendorLower = data.vendor.toLowerCase();
    const vendorFound = knownVendors.some(
      (v) => v.toLowerCase() === vendorLower || vendorLower.includes(v.toLowerCase())
    );
    if (!vendorFound) {
      flags.push("vendor_not_found");
      details.vendor_not_found = `Vendor "${data.vendor}" not found in QuickBooks`;
    }
  }

  // Rule 5: Duplicate invoice (if existing numbers provided)
  if (existingInvoiceNumbers && existingInvoiceNumbers.length > 0 && data.invoice_number) {
    const isDuplicate = existingInvoiceNumbers.some(
      (num) => num.toLowerCase() === data.invoice_number!.toLowerCase()
    );
    if (isDuplicate) {
      flags.push("duplicate_invoice");
      details.duplicate_invoice = `Invoice number "${data.invoice_number}" already exists`;
    }
  }

  // Determine suggested status based on flags and confidence
  let suggestedStatus: SyncStatus;

  if (flags.length > 0) {
    // Any flags = needs attention
    suggestedStatus = "needs_attention";
  } else if (confidenceScore >= 0.95) {
    // High confidence, no flags = auto approve
    suggestedStatus = "auto_approved";
  } else if (confidenceScore >= 0.8) {
    // Medium confidence, no flags = pending review
    suggestedStatus = "pending_review";
  } else {
    // This shouldn't happen (low confidence would be flagged), but handle it
    suggestedStatus = "needs_attention";
  }

  return {
    flags,
    details,
    suggestedStatus,
    confidenceScore,
  };
}

/**
 * Get human-readable description of a sync status
 */
export function getSyncStatusDescription(status: SyncStatus): string {
  switch (status) {
    case "not_applicable":
      return "Not applicable (non-invoice document)";
    case "auto_approved":
      return "Auto-approved (high confidence, ready to sync)";
    case "pending_review":
      return "Pending review (medium confidence)";
    case "needs_attention":
      return "Needs attention (has review flags)";
    case "approved":
      return "Approved (ready to sync)";
    case "rejected":
      return "Rejected";
    case "synced":
      return "Synced to QuickBooks";
    case "error":
      return "Sync error";
    default:
      return "Unknown status";
  }
}

/**
 * Check if a status allows syncing to QuickBooks
 */
export function canSync(status: SyncStatus): boolean {
  return status === "approved" || status === "auto_approved";
}
