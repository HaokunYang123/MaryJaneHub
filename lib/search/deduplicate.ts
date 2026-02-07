export interface DuplicateSummary {
  duplicateCount: number;
  duplicateIds: string[];
}

type SearchLikeResult = {
  id: string;
  fileName: string;
  documentType: string | null;
  extraction: Record<string, unknown>;
  createdAt: string;
  score?: number;
  similarity?: number;
};

type RankedResult<T extends SearchLikeResult> = {
  item: T;
  index: number;
  relevance: number;
  confidence: number;
  createdAtMs: number;
};

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed.toFixed(2);
  }
  return "";
}

function getExtractionData(extraction: Record<string, unknown>): Record<string, unknown> {
  const nested = extraction.data;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }
  return extraction;
}

function getDocType(result: SearchLikeResult): string {
  if (result.documentType) return result.documentType;
  const extractionType = result.extraction.type;
  if (typeof extractionType === "string") return extractionType;
  return "other";
}

function buildKeyFromFields(type: string, fields: string[]): string {
  const compact = fields.filter((field) => field.length > 0);
  if (compact.length < 2) return "";
  return `${type}|${compact.join("|")}`;
}

function buildDuplicateKey(result: SearchLikeResult): string {
  const data = getExtractionData(result.extraction);
  const type = getDocType(result);

  const vendor = normalizeText(data.vendor || data.merchant_name || data.bank_name || data.sender);
  const invoiceNumber = normalizeText(data.invoice_number || data.reference_number);
  const date = normalizeText(data.invoice_date || data.date || data.statement_date);
  const total = normalizeNumber(data.total || data.amount || data.closing_balance);

  if (type === "invoice") {
    const strong = buildKeyFromFields(type, [invoiceNumber, vendor, date, total]);
    if (strong) return strong;
  }

  if (type === "receipt") {
    const key = buildKeyFromFields(type, [vendor, date, total]);
    if (key) return key;
  }

  if (type === "bank_statement") {
    const account = normalizeText(data.account_number || data.account_last4);
    const periodStart = normalizeText(data.statement_period_start || data.period_start);
    const periodEnd = normalizeText(data.statement_period_end || data.period_end);
    const key = buildKeyFromFields(type, [vendor, account, periodStart, periodEnd, total]);
    if (key) return key;
  }

  if (type === "tax_form") {
    const formType = normalizeText(data.form_type);
    const taxYear = normalizeText(data.tax_year || data.year);
    const entity = normalizeText(data.entity_name || data.vendor);
    const key = buildKeyFromFields(type, [formType, taxYear, entity]);
    if (key) return key;
  }

  if (type === "contract") {
    const counterparty = normalizeText(data.counterparty || data.party_name || vendor);
    const effectiveDate = normalizeText(data.effective_date || data.date);
    const key = buildKeyFromFields(type, [counterparty, effectiveDate]);
    if (key) return key;
  }

  const fallback = buildKeyFromFields(type, [vendor, date, total, normalizeText(result.fileName)]);
  if (fallback) return fallback;

  return `id:${result.id}`;
}

function getRelevance(result: SearchLikeResult): number {
  if (typeof result.score === "number" && Number.isFinite(result.score)) return result.score;
  if (typeof result.similarity === "number" && Number.isFinite(result.similarity)) return result.similarity;
  return 0;
}

function getConfidence(result: SearchLikeResult): number {
  const data = getExtractionData(result.extraction);
  const confidence = data.confidence;
  if (typeof confidence === "number" && Number.isFinite(confidence)) return confidence;
  if (typeof confidence === "string") {
    const parsed = Number.parseFloat(confidence);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getCreatedAtMs(result: SearchLikeResult): number {
  const parsed = Date.parse(result.createdAt);
  if (Number.isFinite(parsed)) return parsed;
  return 0;
}

function compareRank<T extends SearchLikeResult>(a: RankedResult<T>, b: RankedResult<T>): number {
  if (Math.abs(b.relevance - a.relevance) > 1e-6) return b.relevance - a.relevance;
  if (Math.abs(b.confidence - a.confidence) > 1e-6) return b.confidence - a.confidence;
  if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
  return a.index - b.index;
}

export function collapseDuplicateSearchResults<T extends SearchLikeResult>(
  results: T[]
): Array<T & DuplicateSummary> {
  const groups = new Map<string, RankedResult<T>[]>();

  results.forEach((result, index) => {
    const ranked: RankedResult<T> = {
      item: result,
      index,
      relevance: getRelevance(result),
      confidence: getConfidence(result),
      createdAtMs: getCreatedAtMs(result),
    };
    const key = buildDuplicateKey(result);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(ranked);
    } else {
      groups.set(key, [ranked]);
    }
  });

  const canonical: Array<RankedResult<T> & DuplicateSummary> = [];
  for (const group of groups.values()) {
    group.sort(compareRank);
    const winner = group[0];
    canonical.push({
      ...winner,
      duplicateCount: Math.max(0, group.length - 1),
      duplicateIds: group.slice(1).map((entry) => entry.item.id),
    });
  }

  canonical.sort(compareRank);

  return canonical.map((entry) => ({
    ...entry.item,
    duplicateCount: entry.duplicateCount,
    duplicateIds: entry.duplicateIds,
  }));
}
