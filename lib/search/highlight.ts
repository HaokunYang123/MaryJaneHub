import type { DocumentLayout, DocumentLayoutBBox } from "../document-ai/types";

export type SearchHighlight = {
  query: string;
  match: string | null;
  quote: string | null;
  page: number | null;
  coords: DocumentLayoutBBox | null;
};

const QUOTE_CONTEXT_CHARS = 60;

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "have",
  "has",
  "had",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "document",
  "documents",
  "invoice",
  "invoices",
  "receipt",
  "receipts",
  "statement",
  "statements",
  "total",
  "amount",
  "date",
]);

type TextMatch = {
  startIndex: number;
  endIndex: number;
  quote: string | null;
  match: string | null;
};

function normalizeCandidates(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const candidates = [trimmed];
  const tokens = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  // Prefer longer tokens to reduce false positives
  tokens.sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    if (!candidates.includes(token)) candidates.push(token);
  }

  return candidates;
}

function findTextMatch(rawText: string, candidates: string[]): TextMatch | null {
  if (!rawText || candidates.length === 0) return null;

  const haystack = rawText;
  const haystackLower = haystack.toLowerCase();

  for (const candidate of candidates) {
    const needle = candidate.toLowerCase();
    if (!needle) continue;
    const index = haystackLower.indexOf(needle);
    if (index !== -1) {
      const start = Math.max(0, index - QUOTE_CONTEXT_CHARS);
      const end = Math.min(haystack.length, index + needle.length + QUOTE_CONTEXT_CHARS);
      const quote = haystack
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim();
      return {
        startIndex: index,
        endIndex: index + needle.length,
        quote: quote || null,
        match: haystack.slice(index, index + needle.length) || candidate,
      };
    }
  }

  return null;
}

function resolveLayoutMatch(
  layout: DocumentLayout | undefined,
  startIndex: number,
  endIndex: number
): { page: number; coords: DocumentLayoutBBox } | null {
  if (!layout) return null;

  for (const page of layout.pages) {
    for (const line of page.lines) {
      const matches = line.segments.some((segment) => {
        const overlaps =
          startIndex >= segment.startIndex && startIndex < segment.endIndex;
        const intersects =
          endIndex > segment.startIndex && endIndex <= segment.endIndex;
        const contains =
          startIndex <= segment.startIndex && endIndex >= segment.endIndex;
        return overlaps || intersects || contains;
      });
      if (!matches) continue;
      if (!line.bbox) continue;
      return {
        page: page.pageNumber,
        coords: line.bbox,
      };
    }
  }

  return null;
}

export function buildSearchHighlight(
  query: string,
  rawText: string | null,
  layout?: DocumentLayout
): SearchHighlight {
  if (!rawText) {
    return {
      query,
      match: null,
      quote: null,
      page: null,
      coords: null,
    };
  }

  const candidates = normalizeCandidates(query);
  const match = findTextMatch(rawText, candidates);

  if (!match) {
    return {
      query,
      match: null,
      quote: null,
      page: null,
      coords: null,
    };
  }

  const resolved = resolveLayoutMatch(layout, match.startIndex, match.endIndex);

  return {
    query,
    match: match.match,
    quote: match.quote,
    page: resolved?.page ?? null,
    coords: resolved?.coords ?? null,
  };
}
