/**
 * Query Parser for Smart Hybrid Search
 *
 * Extracts structured filters (dates, amounts, document types) from natural language queries.
 */

export interface ParsedQuery {
  /** Exact date in YYYY-MM-DD format */
  date?: string;
  /** Year only (for partial date matches) */
  year?: number;
  /** Month (1-12) for partial date matches */
  month?: number;
  /** Amount to search for */
  amount?: number;
  /** Document type filter */
  documentType?: string;
  /** Vendor name hint */
  vendor?: string;
  /** Remaining text for semantic search */
  semanticText: string;
  /** Original query */
  originalQuery: string;
}

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "bank_statement",
  "tax_form",
  "contract",
  "other",
];

/**
 * Parse a date string in various formats and return YYYY-MM-DD
 */
function parseDate(text: string): { date?: string; year?: number; month?: number; consumed: string } {
  const lowerText = text.toLowerCase();

  // Pattern: "18 march 2016" or "march 18 2016" or "march 18, 2016"
  const monthNamePattern = /\b(\d{1,2})?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*,?\s*(\d{1,2})?,?\s*(\d{4})\b/i;
  let match = lowerText.match(monthNamePattern);
  if (match) {
    const month = MONTH_NAMES[match[2].toLowerCase()];
    const day = match[1] ? parseInt(match[1]) : (match[3] ? parseInt(match[3]) : undefined);
    const year = parseInt(match[4]);

    if (day && month && year) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { date, year, month, consumed: match[0] };
    } else if (month && year) {
      return { year, month, consumed: match[0] };
    }
  }

  // Pattern: "march 2016" (month + year only)
  const monthYearPattern = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{4})\b/i;
  match = lowerText.match(monthYearPattern);
  if (match) {
    const month = MONTH_NAMES[match[1].toLowerCase()];
    const year = parseInt(match[2]);
    return { year, month, consumed: match[0] };
  }

  // Pattern: "MM/DD/YYYY" or "MM-DD-YYYY"
  const slashPattern = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/;
  match = text.match(slashPattern);
  if (match) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    const year = parseInt(match[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { date, year, month, consumed: match[0] };
    }
  }

  // Pattern: "YYYY-MM-DD"
  const isoPattern = /\b(\d{4})-(\d{2})-(\d{2})\b/;
  match = text.match(isoPattern);
  if (match) {
    return { date: match[0], year: parseInt(match[1]), month: parseInt(match[2]), consumed: match[0] };
  }

  // Pattern: just a year "2016"
  const yearPattern = /\b(20\d{2}|19\d{2})\b/;
  match = text.match(yearPattern);
  if (match) {
    return { year: parseInt(match[1]), consumed: match[0] };
  }

  return { consumed: "" };
}

/**
 * Parse amount from text
 */
function parseAmount(text: string): { amount?: number; consumed: string } {
  // Pattern: "$44.00" or "$44" or "44 dollars" or "44.00"
  const patterns = [
    /\$(\d+(?:\.\d{2})?)/,  // $44 or $44.00
    /(\d+(?:\.\d{2})?)\s*(?:dollars?|usd)/i,  // 44 dollars
    /(?:^|\s)(\d+\.\d{2})(?:\s|$)/,  // 44.00 (with decimals, likely a price)
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return { amount: parseFloat(match[1]), consumed: match[0] };
    }
  }

  return { consumed: "" };
}

/**
 * Parse document type from text
 */
function parseDocumentType(text: string): { documentType?: string; consumed: string } {
  const lowerText = text.toLowerCase();

  for (const type of DOCUMENT_TYPES) {
    // Match singular or plural, and handle underscore variants
    const typeVariants = [
      type,
      type.replace(/_/g, " "),
      type + "s",
      type.replace(/_/g, " ") + "s",
    ];

    for (const variant of typeVariants) {
      const pattern = new RegExp(`\\b${variant}\\b`, "i");
      const match = lowerText.match(pattern);
      if (match) {
        return { documentType: type, consumed: match[0] };
      }
    }
  }

  return { consumed: "" };
}

/**
 * Extract vendor name from preposition phrases (from/by/for + name)
 */
function parseVendor(text: string): { vendor?: string; consumed: string } {
  // Match "from centerpointe", "by fedex", "for bega cheese" (case-insensitive, 1-3 words)
  const match = text.match(/\b(?:from|by|for)\s+(\w{2,}(?:\s+\w{2,}){0,2})\b/i);
  if (!match) return { consumed: "" };

  const candidate = match[1].trim();

  // Stopword guard: skip time expressions, document types, common words
  const STOPWORDS = /^(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|last|this|next|all|the|my|our|a|an|each|every|invoices?|receipts?|documents?|contracts?|bank|statements?|tax|forms?|files?|\d{4})\b/i;
  if (STOPWORDS.test(candidate)) return { consumed: "" };

  return { vendor: candidate, consumed: match[0] };
}

/**
 * Parse a natural language query and extract structured filters
 */
export function parseQuery(query: string): ParsedQuery {
  let remainingText = query;
  const consumed: string[] = [];

  // Extract date
  const dateResult = parseDate(remainingText);
  if (dateResult.consumed) {
    consumed.push(dateResult.consumed);
    remainingText = remainingText.replace(dateResult.consumed, " ");
  }

  // Extract amount
  const amountResult = parseAmount(remainingText);
  if (amountResult.consumed) {
    consumed.push(amountResult.consumed);
    remainingText = remainingText.replace(amountResult.consumed, " ");
  }

  // Extract document type
  const typeResult = parseDocumentType(remainingText);
  if (typeResult.consumed) {
    consumed.push(typeResult.consumed);
    remainingText = remainingText.replace(typeResult.consumed, " ");
  }

  // Extract vendor (after doc type so "invoices from X" correctly picks up X)
  const vendorResult = parseVendor(remainingText);
  if (vendorResult.consumed) {
    consumed.push(vendorResult.consumed);
    remainingText = remainingText.replace(vendorResult.consumed, " ");
  }

  // Clean up remaining text
  const semanticText = remainingText
    .replace(/\s+/g, " ")
    .trim();

  return {
    date: dateResult.date,
    year: dateResult.year,
    month: dateResult.month,
    amount: amountResult.amount,
    documentType: typeResult.documentType,
    vendor: vendorResult.vendor,
    semanticText,
    originalQuery: query,
  };
}

/**
 * Format parsed query for display
 */
export function formatParsedQuery(parsed: ParsedQuery): string {
  const parts: string[] = [];

  if (parsed.date) {
    parts.push(`date=${parsed.date}`);
  } else if (parsed.year && parsed.month) {
    parts.push(`month=${parsed.year}-${String(parsed.month).padStart(2, "0")}`);
  } else if (parsed.year) {
    parts.push(`year=${parsed.year}`);
  }

  if (parsed.amount) {
    parts.push(`amount=$${parsed.amount.toFixed(2)}`);
  }

  if (parsed.documentType) {
    parts.push(`type=${parsed.documentType}`);
  }

  if (parsed.semanticText) {
    parts.push(`text="${parsed.semanticText}"`);
  }

  return parts.join(", ");
}
