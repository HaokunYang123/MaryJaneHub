/**
 * Smart Hybrid Search
 *
 * Combines structured database queries (date, amount, type) with semantic search.
 * Structured matches get higher confidence scores.
 */

import { getSupabase } from "../supabase/client";
import { generateEmbedding } from "../gemini/embeddings";
import { parseQuery, formatParsedQuery, type ParsedQuery } from "./parse-query";
import { collapseDuplicateSearchResults } from "./deduplicate";

export interface SmartSearchResult {
  id: string;
  fileName: string;
  documentType: string | null;
  score: number;
  matchType: "exact" | "semantic" | "hybrid";
  matchedFields: string[];
  extraction: Record<string, unknown>;
  createdAt: string;
  duplicateCount?: number;
  duplicateIds?: string[];
}

export interface SmartSearchResponse {
  success: true;
  results: SmartSearchResult[];
  query: string;
  parsedQuery: ParsedQuery;
  processingTimeMs: number;
}

export interface SmartSearchError {
  success: false;
  error: string;
  query: string;
}

export type SmartSearchResultType = SmartSearchResponse | SmartSearchError;

/**
 * Calculate text relevance score for a document based on keyword matching
 * Returns a bonus score (0-0.5) based on how well keywords match
 */
function calculateTextRelevanceBonus(
  keywords: string[],
  fileName: string,
  vendorName: string | null | undefined,
  rawText: string | null | undefined
): { bonus: number; matchedKeywords: string[] } {
  if (keywords.length === 0) {
    return { bonus: 0, matchedKeywords: [] };
  }

  const fileNameLower = fileName.toLowerCase();
  const vendorLower = (vendorName || "").toLowerCase();
  const rawTextLower = (rawText || "").toLowerCase().slice(0, 2000); // Limit for performance

  let bonus = 0;
  const matchedKeywords: string[] = [];

  for (const keyword of keywords) {
    const kw = keyword.toLowerCase();
    if (kw.length < 2) continue; // Skip very short keywords

    // Exact vendor name match: +0.25
    if (vendorLower && vendorLower.includes(kw)) {
      bonus += 0.25;
      matchedKeywords.push(`vendor:${keyword}`);
    }
    // File name contains keyword: +0.15
    else if (fileNameLower.includes(kw)) {
      bonus += 0.15;
      matchedKeywords.push(`filename:${keyword}`);
    }
    // Raw text contains keyword: +0.05
    else if (rawTextLower.includes(kw)) {
      bonus += 0.05;
      matchedKeywords.push(`text:${keyword}`);
    }
  }

  // Cap bonus at 0.5
  return { bonus: Math.min(0.5, bonus), matchedKeywords };
}

/**
 * Extract keywords from semantic text for boosting
 */
function extractKeywords(text: string): string[] {
  // Remove common words and split into keywords
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "must", "shall", "can", "need",
    "company", "inc", "llc", "corp", "corporation", "document", "file"
  ]);

  return text
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ""))
    .filter(w => w.length >= 2 && !stopWords.has(w));
}

/**
 * Execute structured search - fetch docs and filter client-side
 * (Supabase JSONB queries are complex, client-side filtering is simpler for small datasets)
 */
async function structuredSearch(
  parsed: ParsedQuery,
  limit: number
): Promise<SmartSearchResult[]> {
  const supabase = getSupabase();

  // Build base query - include raw_text for keyword matching
  let query = supabase
    .from("documents")
    .select("id, file_name, document_type, extraction, created_at, raw_text");

  // Apply document type filter at DB level (simple equality)
  if (parsed.documentType) {
    query = query.eq("document_type", parsed.documentType);
  }

  // Fetch more docs for client-side filtering
  const { data, error } = await query.limit(500);

  if (error) {
    console.error("Structured search error:", error);
    return [];
  }

  // Extract keywords from semantic text for boosting
  const keywords = extractKeywords(parsed.semanticText);

  // Client-side filtering and scoring
  const results: SmartSearchResult[] = [];

  for (const row of data || []) {
    const extraction = row.extraction as Record<string, unknown>;
    const extractionData = (extraction?.data || extraction) as Record<string, unknown>;
    const matchedFields: string[] = [];

    // Check date match
    const docDate = (extractionData?.invoice_date || extractionData?.date) as string | undefined;

    if (parsed.date && docDate === parsed.date) {
      matchedFields.push("date");
    } else if (parsed.year && parsed.month && docDate) {
      const monthPrefix = `${parsed.year}-${String(parsed.month).padStart(2, "0")}`;
      if (docDate.startsWith(monthPrefix)) {
        matchedFields.push("month");
      }
    } else if (parsed.year && docDate) {
      if (docDate.startsWith(String(parsed.year))) {
        matchedFields.push("year");
      }
    }

    // Check amount match (±5% tolerance)
    const total = extractionData?.total as number | undefined;
    if (parsed.amount && total) {
      const tolerance = parsed.amount * 0.05;
      if (Math.abs(total - parsed.amount) <= tolerance) {
        matchedFields.push("amount");
      }
    }

    // Check document type match
    if (parsed.documentType && row.document_type === parsed.documentType) {
      matchedFields.push("type");
    }

    // Only include if something matched
    if (matchedFields.length > 0) {
      // Base score by number of matched structured fields
      let score = 0.5 + matchedFields.length * 0.1;

      // Calculate text relevance bonus
      const vendorName = extractionData?.vendor as string | undefined;
      const { bonus, matchedKeywords } = calculateTextRelevanceBonus(
        keywords,
        row.file_name,
        vendorName,
        row.raw_text
      );

      score += bonus;
      matchedFields.push(...matchedKeywords);

      results.push({
        id: row.id,
        fileName: row.file_name,
        documentType: row.document_type,
        score: Math.min(1.0, score),
        matchType: bonus > 0 ? "hybrid" : "exact",
        matchedFields,
        extraction: row.extraction as Record<string, unknown>,
        createdAt: row.created_at,
      });
    }
  }

  // Sort by score descending, then by date descending
  results.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.01) {
      return b.score - a.score;
    }
    // Secondary sort by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return results.slice(0, limit);
}

/**
 * Execute semantic search using embeddings
 */
async function semanticSearch(
  text: string,
  limit: number,
  excludeIds: string[] = []
): Promise<SmartSearchResult[]> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const embeddingResult = await generateEmbedding(text);
  if (!embeddingResult.success) {
    console.error("Embedding generation failed:", embeddingResult.error);
    return [];
  }

  const supabase = getSupabase();

  const { data, error } = await supabase.rpc("search_documents", {
    query_embedding: `[${embeddingResult.embedding.join(",")}]`,
    match_threshold: 0.4,
    match_count: limit + excludeIds.length,
    filter_document_type: null,
  });

  if (error) {
    console.error("Semantic search error:", error);
    return [];
  }

  return (data || [])
    .filter((row: { id: string }) => !excludeIds.includes(row.id))
    .slice(0, limit)
    .map((row: {
      id: string;
      file_name: string;
      document_type: string | null;
      similarity: number;
      extraction: Record<string, unknown>;
      created_at: string;
    }) => ({
      id: row.id,
      fileName: row.file_name,
      documentType: row.document_type,
      score: row.similarity,
      matchType: "semantic" as const,
      matchedFields: ["semantic"],
      extraction: row.extraction,
      createdAt: row.created_at,
    }));
}

/**
 * Smart search combining structured and semantic search
 */
export async function smartSearch(
  query: string,
  options: { limit?: number; collapseDuplicates?: boolean } = {}
): Promise<SmartSearchResultType> {
  const startTime = Date.now();
  const limit = options.limit || 10;
  const collapseDuplicates = options.collapseDuplicates ?? true;

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      error: "Search query cannot be empty",
      query,
    };
  }

  try {
    // Parse the query
    const parsed = parseQuery(query);
    console.log(`[SmartSearch] Parsed: ${formatParsedQuery(parsed)}`);

    // Run structured search if we have filters
    const hasStructuredFilters = parsed.date || parsed.year || parsed.amount || parsed.documentType;
    let structuredResults: SmartSearchResult[] = [];

    if (hasStructuredFilters) {
      structuredResults = await structuredSearch(parsed, limit);
      console.log(`[SmartSearch] Structured: ${structuredResults.length} results`);
    }

    // Run semantic search on remaining text or full query if no structured results
    let semanticResults: SmartSearchResult[] = [];
    const semanticQuery = parsed.semanticText || query;

    if (structuredResults.length < limit) {
      const excludeIds = structuredResults.map((r) => r.id);
      const remainingLimit = limit - structuredResults.length;
      semanticResults = await semanticSearch(semanticQuery, remainingLimit, excludeIds);
      console.log(`[SmartSearch] Semantic: ${semanticResults.length} results`);
    }

    // Combine results - structured first (higher confidence), then semantic
    const results = [...structuredResults, ...semanticResults];

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    const dedupedResults = collapseDuplicates
      ? collapseDuplicateSearchResults(results)
      : results.map((item) => ({ ...item, duplicateCount: 0, duplicateIds: [] }));

    return {
      success: true,
      results: dedupedResults.slice(0, limit),
      query,
      parsedQuery: parsed,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Smart search failed: ${errorMessage}`,
      query,
    };
  }
}
