import type { FieldEvidenceMap } from "../gemini/field-evidence";
import type { InvoiceExtraction } from "../gemini/types";

const MIN_AUTO_APPROVED_CONFIDENCE = 0.95;
const AMOUNT_TOLERANCE_ABSOLUTE = 1;
const AMOUNT_TOLERANCE_RATIO = 0.02;

type ChecklistSeverity = "error" | "warning";

export interface PreSyncChecklistCheck {
  key: string;
  severity: ChecklistSeverity;
  passed: boolean;
  message: string;
}

export interface PreSyncChecklistInput {
  syncStatus: string | null | undefined;
  reviewFlags?: string[] | null;
  confidenceScore?: number | null;
  extraction: InvoiceExtraction;
  strictEvidence?: boolean;
}

export interface PreSyncChecklistResult {
  passed: boolean;
  checks: PreSyncChecklistCheck[];
  errors: string[];
  warnings: string[];
}

function addCheck(
  checks: PreSyncChecklistCheck[],
  key: string,
  severity: ChecklistSeverity,
  passed: boolean,
  message: string
): void {
  checks.push({ key, severity, passed, message });
}

function isValidDateString(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeAmount(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function computeTolerance(base: number): number {
  return Math.max(AMOUNT_TOLERANCE_ABSOLUTE, Math.abs(base) * AMOUNT_TOLERANCE_RATIO);
}

function hasUsableEvidence(
  fieldEvidence: FieldEvidenceMap | undefined,
  field: string
): boolean {
  if (!fieldEvidence) return false;
  const entry = fieldEvidence[field];
  if (!entry) return false;
  return Boolean(
    entry.evidence?.quote ||
    entry.evidence?.page ||
    entry.evidence?.coords
  );
}

export function evaluatePreSyncChecklist(
  input: PreSyncChecklistInput
): PreSyncChecklistResult {
  const checks: PreSyncChecklistCheck[] = [];
  const status = input.syncStatus || "unknown";
  const reviewFlags = input.reviewFlags || [];
  const extraction = input.extraction;
  const fieldEvidence = extraction.field_evidence as FieldEvidenceMap | undefined;
  const evidenceSeverity: ChecklistSeverity = input.strictEvidence ? "error" : "warning";

  addCheck(
    checks,
    "status_allowed",
    "error",
    status === "approved" || status === "auto_approved",
    `Status must be approved or auto_approved (current: ${status})`
  );

  addCheck(
    checks,
    "no_review_flags",
    "error",
    reviewFlags.length === 0,
    reviewFlags.length === 0
      ? "No review flags"
      : `Review flags present: ${reviewFlags.join(", ")}`
  );

  if (status === "auto_approved") {
    const score = typeof input.confidenceScore === "number" ? input.confidenceScore : 0;
    addCheck(
      checks,
      "auto_approved_confidence",
      "error",
      score >= MIN_AUTO_APPROVED_CONFIDENCE,
      `Auto-approved confidence must be >= ${(MIN_AUTO_APPROVED_CONFIDENCE * 100).toFixed(0)}% (current: ${(score * 100).toFixed(1)}%)`
    );
  }

  const vendor = extraction.vendor?.trim() || null;
  addCheck(
    checks,
    "vendor_present",
    "error",
    Boolean(vendor),
    "Vendor must be present"
  );

  const invoiceDateValid = isValidDateString(extraction.invoice_date);
  const dueDateValid = isValidDateString(extraction.due_date);
  addCheck(
    checks,
    "date_present_and_valid",
    "error",
    invoiceDateValid || dueDateValid,
    "Invoice date or due date must be present and parseable"
  );

  const lineAmounts = (extraction.line_items || [])
    .map((line) => normalizeAmount(line.amount))
    .filter((amount): amount is number => amount !== null);
  const hasPositiveLineAmount = lineAmounts.some((amount) => amount > 0);
  const subtotal = normalizeAmount(extraction.subtotal);
  const tax = normalizeAmount(extraction.tax);
  const total = normalizeAmount(extraction.total);
  const hasPositiveTotal = total !== null && total > 0;

  addCheck(
    checks,
    "has_positive_amount",
    "error",
    hasPositiveLineAmount || hasPositiveTotal,
    "Need at least one positive amount (line item amount or total)"
  );

  const negativeAmounts =
    [subtotal, tax, total].some((amount) => amount !== null && amount < 0) ||
    lineAmounts.some((amount) => amount < 0);
  addCheck(
    checks,
    "non_negative_amounts",
    "error",
    !negativeAmounts,
    "Subtotal, tax, total, and line amounts must be non-negative"
  );

  if (hasPositiveTotal && hasPositiveLineAmount) {
    const totalAmount = total as number;
    const lineSum = lineAmounts.reduce((sum, amount) => sum + amount, 0);
    const difference = Math.abs(totalAmount - lineSum);
    const tolerance = computeTolerance(totalAmount);
    addCheck(
      checks,
      "line_items_total_consistent",
      "error",
      difference <= tolerance,
      `Line items sum (${lineSum.toFixed(2)}) must match total (${totalAmount.toFixed(2)}) within ${tolerance.toFixed(2)}`
    );
  }

  if (hasPositiveTotal && subtotal !== null) {
    const totalAmount = total as number;
    const expectedTotal = subtotal + (tax && tax > 0 ? tax : 0);
    const difference = Math.abs(totalAmount - expectedTotal);
    const tolerance = computeTolerance(totalAmount);
    addCheck(
      checks,
      "subtotal_tax_total_consistent",
      "error",
      difference <= tolerance,
      `Subtotal + tax (${expectedTotal.toFixed(2)}) must match total (${totalAmount.toFixed(2)}) within ${tolerance.toFixed(2)}`
    );
  }

  addCheck(
    checks,
    "invoice_number_present",
    "warning",
    Boolean(extraction.invoice_number?.trim()),
    "Invoice number is missing"
  );

  addCheck(
    checks,
    "evidence_vendor",
    evidenceSeverity,
    hasUsableEvidence(fieldEvidence, "vendor"),
    "No vendor evidence quote/location found"
  );
  addCheck(
    checks,
    "evidence_total",
    evidenceSeverity,
    hasUsableEvidence(fieldEvidence, "total"),
    "No total evidence quote/location found"
  );
  addCheck(
    checks,
    "evidence_date",
    evidenceSeverity,
    hasUsableEvidence(fieldEvidence, "invoice_date") || hasUsableEvidence(fieldEvidence, "due_date"),
    "No date evidence quote/location found"
  );

  const errors = checks
    .filter((check) => check.severity === "error" && !check.passed)
    .map((check) => check.message);
  const warnings = checks
    .filter((check) => check.severity === "warning" && !check.passed)
    .map((check) => check.message);

  return {
    passed: errors.length === 0,
    checks,
    errors,
    warnings,
  };
}
