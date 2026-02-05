import type { DocumentExtraction } from "../gemini/extract-document";
import type { DocumentLayout } from "../document-ai/types";
import type { FieldEvidenceMap, FieldEvidenceEntry, EvidenceLocation } from "../gemini/field-evidence";

const QUOTE_CONTEXT_CHARS = 60;

const KEY_FIELDS_BY_TYPE: Record<DocumentExtraction["type"], string[]> = {
  invoice: [
    "vendor",
    "invoice_number",
    "invoice_date",
    "due_date",
    "subtotal",
    "tax",
    "total",
  ],
  other: [
    "vendor",
    "invoice_number",
    "invoice_date",
    "due_date",
    "subtotal",
    "tax",
    "total",
  ],
  receipt: [
    "merchant_name",
    "date",
    "total",
    "subtotal",
    "tax",
    "tip",
    "payment_method",
  ],
  bank_statement: [
    "bank_name",
    "account_number_last4",
    "statement_period_start",
    "statement_period_end",
    "opening_balance",
    "closing_balance",
    "total_deposits",
    "total_withdrawals",
  ],
  contract: [
    "contract_type",
    "effective_date",
    "expiration_date",
    "value",
    "governing_law",
    "termination_clause",
  ],
  tax_form: [
    "form_type",
    "tax_year",
    "entity_name",
    "ein_last4",
    "ssn_last4",
    "total_income",
    "total_tax",
    "refund_or_owed",
  ],
  correspondence: [
    "sender",
    "sender_organization",
    "recipient",
    "recipient_organization",
    "date",
    "subject",
    "summary",
    "correspondence_type",
    "urgency",
  ],
};

function formatNumber(value: number, digits: number): string {
  return value.toFixed(digits);
}

function withCommas(value: string): string {
  const [whole, fraction] = value.split(".");
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${withSep}.${fraction}` : withSep;
}

function normalizeSearchValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (typeof value === "number") {
    const raw = value.toString();
    const fixed2 = formatNumber(value, 2);
    const fixed0 = Number.isInteger(value) ? formatNumber(value, 0) : null;
    const variants = [raw, fixed2, withCommas(fixed2)];
    if (fixed0) {
      variants.push(fixed0, withCommas(fixed0));
    }
    return Array.from(new Set(variants.filter(Boolean)));
  }

  if (Array.isArray(value)) {
    const joined = value.map((v) => String(v)).join(", ");
    return joined ? [joined] : [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  return [String(value)];
}

type TextMatch = {
  startIndex: number;
  endIndex: number;
  quote: string | null;
};

function findTextMatch(rawText: string, searchValues: string[]): TextMatch | null {
  if (!rawText || searchValues.length === 0) return null;

  const haystack = rawText;
  const haystackLower = haystack.toLowerCase();

  for (const candidate of searchValues) {
    const needle = candidate.toLowerCase();
    if (!needle) continue;
    const index = haystackLower.indexOf(needle);
    if (index !== -1) {
      const start = Math.max(0, index - QUOTE_CONTEXT_CHARS);
      const end = Math.min(haystack.length, index + candidate.length + QUOTE_CONTEXT_CHARS);
      const quote = haystack
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim();
      return {
        startIndex: index,
        endIndex: index + candidate.length,
        quote: quote || null,
      };
    }
  }

  return null;
}

function resolveLayoutMatch(
  layout: DocumentLayout | undefined,
  startIndex: number,
  endIndex: number
): { page: number; coords: EvidenceLocation["coords"] } | null {
  if (!layout) return null;

  for (const page of layout.pages) {
    for (const line of page.lines) {
      const matches = line.segments.some((segment) => {
        const overlaps =
          startIndex >= segment.startIndex && startIndex < segment.endIndex;
        const intersects =
          endIndex > segment.startIndex && endIndex <= segment.endIndex;
        return overlaps || intersects;
      });
      if (!matches) continue;
      return {
        page: page.pageNumber,
        coords: line.bbox,
      };
    }
  }

  return null;
}

function buildEvidenceLocation(
  rawText: string,
  searchValues: string[],
  layout?: DocumentLayout
): EvidenceLocation {
  const match = findTextMatch(rawText, searchValues);
  if (!match) {
    return { page: null, quote: null, coords: null };
  }

  const resolved = resolveLayoutMatch(layout, match.startIndex, match.endIndex);

  return {
    page: resolved?.page ?? null,
    quote: match.quote,
    coords: resolved?.coords ?? null,
  };
}

function buildEvidenceEntry(
  value: unknown,
  confidence: number,
  rawText: string,
  layout?: DocumentLayout
): FieldEvidenceEntry {
  const searchValues = normalizeSearchValues(value);
  const evidence = buildEvidenceLocation(rawText, searchValues, layout);
  const hasValue =
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value.trim() === "") &&
    !(Array.isArray(value) && value.length === 0);

  return {
    value,
    confidence: hasValue ? confidence : 0,
    evidence,
  };
}

export function getEditableFieldsForExtraction(
  extraction: DocumentExtraction
): string[] {
  return KEY_FIELDS_BY_TYPE[extraction.type] || [];
}

export function buildFieldEvidence(
  extraction: DocumentExtraction,
  rawText: string,
  layout?: DocumentLayout
): FieldEvidenceMap {
  const data = extraction.data as Record<string, unknown>;
  const confidence =
    typeof data.confidence === "number" ? data.confidence : 0;

  const fields = getEditableFieldsForExtraction(extraction);
  const evidence: FieldEvidenceMap = {};

  for (const field of fields) {
    evidence[field] = buildEvidenceEntry(data[field], confidence, rawText, layout);
  }

  return evidence;
}

function normalizeEvidenceLocation(
  existing: EvidenceLocation | undefined,
  fallback: EvidenceLocation
): EvidenceLocation {
  return {
    page: existing?.page ?? fallback.page ?? null,
    quote: existing?.quote ?? fallback.quote ?? null,
    coords: existing?.coords ?? fallback.coords ?? null,
  };
}

function mergeEvidenceEntry(
  existing: FieldEvidenceEntry | undefined,
  fallback: FieldEvidenceEntry
): FieldEvidenceEntry {
  if (!existing) return fallback;
  return {
    value: fallback.value,
    confidence: existing.confidence ?? fallback.confidence ?? null,
    evidence: normalizeEvidenceLocation(existing.evidence, fallback.evidence),
  };
}

export function mergeFieldEvidence(
  existing: FieldEvidenceMap | undefined,
  computed: FieldEvidenceMap
): FieldEvidenceMap {
  if (!existing) return computed;

  const merged: FieldEvidenceMap = { ...computed };

  for (const [key, entry] of Object.entries(existing)) {
    if (merged[key]) {
      merged[key] = mergeEvidenceEntry(entry, merged[key]);
    } else {
      merged[key] = entry;
    }
  }

  return merged;
}

export function ensureFieldEvidence(
  extraction: DocumentExtraction,
  rawText: string,
  existing?: FieldEvidenceMap | null,
  layout?: DocumentLayout
): FieldEvidenceMap {
  const computed = buildFieldEvidence(extraction, rawText, layout);
  return mergeFieldEvidence(existing || undefined, computed);
}
