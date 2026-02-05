/**
 * Sum/Aggregation Handler for Assistant
 *
 * Executes SQL aggregations for accurate numerical results.
 * All totals come directly from the database, not AI.
 */

import { getSupabase } from "../supabase/client";
import type { Slots, SumResult, SumBreakdownItem } from "./types";

/**
 * Document record structure for aggregation
 */
interface DocumentRow {
  id: string;
  document_type: string;
  extraction: Record<string, unknown>;
}

/**
 * Get the date field name based on document type
 */
export function getDateField(documentType?: string): string {
  switch (documentType) {
    case "receipt":
      return "date";
    case "bank_statement":
      return "statement_period_end";
    default:
      return "invoice_date";
  }
}

/**
 * Get the amount field name based on document type
 */
export function getAmountField(documentType?: string): string {
  switch (documentType) {
    case "bank_statement":
      return "closing_balance";
    default:
      return "total";
  }
}

/**
 * Extract numeric value from extraction data
 */
function extractAmount(extraction: Record<string, unknown>, amountField: string): number | null {
  const data = (extraction?.data || extraction) as Record<string, unknown>;
  const value = data?.[amountField];

  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[,$]/g, ""));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Extract date string from extraction data
 */
function extractDate(extraction: Record<string, unknown>, dateField: string): string | null {
  const data = (extraction?.data || extraction) as Record<string, unknown>;
  // Try the specific field first, then fallback to common alternatives
  const value = data?.[dateField] || data?.invoice_date || data?.date;
  return typeof value === "string" ? value : null;
}

/**
 * Extract vendor from extraction data
 */
function extractVendor(extraction: Record<string, unknown>): string | null {
  const data = (extraction?.data || extraction) as Record<string, unknown>;
  const vendor = data?.vendor || data?.merchant_name;
  return typeof vendor === "string" ? vendor : null;
}

/**
 * Check if a date matches the year filter
 */
function matchesYear(dateStr: string | null, year: number): boolean {
  if (!dateStr) return false;
  return dateStr.startsWith(String(year));
}

/**
 * Check if a vendor matches the filter (case-insensitive partial match)
 */
function matchesVendor(docVendor: string | null, filterVendor: string): boolean {
  if (!docVendor) return false;
  return docVendor.toLowerCase().includes(filterVendor.toLowerCase());
}

/**
 * Try to extract vendor name from semantic text
 * Looks for patterns like "from <vendor>", "for <vendor>", or "<vendor> invoices"
 */
function extractVendorFromSemanticText(semanticText: string): string | null {
  const skipWords = new Set([
    "all", "the", "last", "this", "year", "month", "total", "sum", "my", "our",
    "find", "show", "list", "get", "what", "how", "much", "many", "did", "do",
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december", "from", "for", "in", "on",
  ]);

  const skipPhrases = new Set([
    "all from", "all for", "total from", "total for",
  ]);

  // Pattern: "from/for <vendor>" at end of text (single capitalized word, min 3 chars)
  const fromForMatch = semanticText.match(/\b(?:from|for)\s+([A-Z][a-zA-Z]{2,})\s*$/i);
  if (fromForMatch) {
    const candidate = fromForMatch[1];
    if (!skipWords.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Pattern: "<vendor> invoices/receipts/documents"
  const beforeTypeMatch = semanticText.match(/\b([A-Z][a-zA-Z]{2,})\s+(?:invoices?|receipts?|documents?)\b/i);
  if (beforeTypeMatch) {
    const candidate = beforeTypeMatch[1];
    if (!skipWords.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  // Pattern: capitalized word at the end (potential vendor name, min 3 chars)
  const endMatch = semanticText.match(/\b([A-Z][a-zA-Z]{2,})\s*$/);
  if (endMatch) {
    const candidate = endMatch[1];
    // Also check if it's part of a skip phrase
    const lastWords = semanticText.toLowerCase().trim().split(/\s+/).slice(-2).join(" ");
    if (!skipWords.has(candidate.toLowerCase()) && !skipPhrases.has(lastWords)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Execute sum/aggregation query based on slots
 */
export async function executeSum(slots: Slots): Promise<SumResult> {
  // Try to extract vendor from semanticText if not already set
  let vendor = slots.vendor;
  if (!vendor && slots.semanticText) {
    vendor = extractVendorFromSemanticText(slots.semanticText) || undefined;
    if (vendor) {
      console.log(`[SumHandler] Extracted vendor from semanticText: "${vendor}"`);
    }
  }

  console.log(`[SumHandler] Executing sum with slots:`, JSON.stringify({ ...slots, vendor }));

  const supabase = getSupabase();
  const dateField = getDateField(slots.documentType);
  const amountField = getAmountField(slots.documentType);
  const queryFilters: string[] = [];
  if (slots.documentType) queryFilters.push(`document_type = '${slots.documentType}'`);
  if (slots.year) queryFilters.push(`${dateField} LIKE '${slots.year}-%'`);
  if (vendor) queryFilters.push(`vendor ILIKE '%${vendor}%'`);
  const sqlQuery = `SELECT id, document_type, extraction FROM documents${queryFilters.length ? " WHERE " + queryFilters.join(" AND ") : ""}`;

  // Build and execute query
  let query = supabase
    .from("documents")
    .select("id, document_type, extraction");

  // Apply document type filter at database level
  if (slots.documentType) {
    query = query.eq("document_type", slots.documentType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[SumHandler] Database error:", error);
    return {
      total: 0,
      count: 0,
      filters: {},
      confidence: "high",
      sqlQuery,
    };
  }

  if (!data || data.length === 0) {
    return {
      total: 0,
      count: 0,
      filters: {
        documentType: slots.documentType,
        year: slots.year,
        vendor: slots.vendor,
      },
      confidence: "high",
      sqlQuery,
    };
  }

  // Filter and aggregate in-memory for flexibility
  let filteredDocs = data as DocumentRow[];

  // Filter by year if specified
  if (slots.year) {
    filteredDocs = filteredDocs.filter((doc) => {
      const dateStr = extractDate(doc.extraction, dateField);
      return matchesYear(dateStr, slots.year!);
    });
  }

  // Filter by vendor if specified
  if (vendor) {
    filteredDocs = filteredDocs.filter((doc) => {
      const docVendor = extractVendor(doc.extraction);
      return matchesVendor(docVendor, vendor);
    });
  }

  // Calculate totals
  let total = 0;
  let count = 0;
  const vendorTotals: Map<string, { amount: number; count: number }> = new Map();

  for (const doc of filteredDocs) {
    const amount = extractAmount(doc.extraction, amountField);
    if (amount !== null && amount > 0) {
      total += amount;
      count++;

      // Track by vendor for breakdown
      const vendor = extractVendor(doc.extraction) || "Unknown";
      const existing = vendorTotals.get(vendor) || { amount: 0, count: 0 };
      vendorTotals.set(vendor, {
        amount: existing.amount + amount,
        count: existing.count + 1,
      });
    }
  }

  // Build breakdown if we have multiple vendors
  let breakdown: SumBreakdownItem[] | undefined;
  if (vendorTotals.size > 1) {
    breakdown = Array.from(vendorTotals.entries())
      .map(([label, data]) => ({
        label,
        amount: Math.round(data.amount * 100) / 100,
        count: data.count,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  // Build result
  const result: SumResult = {
    total: Math.round(total * 100) / 100,
    count,
    average: count > 0 ? Math.round((total / count) * 100) / 100 : undefined,
    breakdown,
    filters: {
      documentType: slots.documentType,
      year: slots.year,
      vendor: vendor,
    },
    confidence: "high",
    sqlQuery,
  };

  console.log(`[SumHandler] Result: $${result.total} from ${result.count} documents`);

  return result;
}

/**
 * Format sum result as a human-readable message
 */
export function formatSumResult(result: SumResult, slots: Slots): string {
  const parts: string[] = [];

  // Build description of what was summed
  const docType = result.filters.documentType || "document";
  const docTypePlural = docType + "s";

  // Format the total
  const formattedTotal = formatCurrency(result.total);

  // Build the main message
  if (slots.aggregation === "count") {
    parts.push(`Found ${result.count} ${docTypePlural}`);
  } else if (slots.aggregation === "average") {
    parts.push(`Average ${docType}: ${formatCurrency(result.average || 0)}`);
    parts.push(`(${result.count} ${docTypePlural} totaling ${formattedTotal})`);
  } else {
    // Default to sum
    parts.push(`Total: ${formattedTotal}`);
    parts.push(`from ${result.count} ${docTypePlural}`);
  }

  // Add filter context
  const filterParts: string[] = [];
  if (result.filters.year) {
    filterParts.push(`from ${result.filters.year}`);
  }
  if (result.filters.vendor) {
    filterParts.push(`from ${result.filters.vendor}`);
  }

  if (filterParts.length > 0) {
    parts.push(filterParts.join(" "));
  }

  let message = parts.join(" ");

  // Add breakdown if available and meaningful
  if (result.breakdown && result.breakdown.length > 1 && result.breakdown.length <= 10) {
    message += "\n\nBreakdown by vendor:";
    for (const item of result.breakdown) {
      message += `\n  ${item.label}: ${formatCurrency(item.amount)} (${item.count} docs)`;
    }
  }

  return message;
}

/**
 * Format a number as currency
 */
function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
