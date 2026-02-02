/**
 * Semantic Search Service
 *
 * Provides semantic search capabilities using Gemini embeddings
 * and Supabase pgvector for document similarity search.
 */

import { getSupabase } from "../supabase/client";
import { generateEmbedding, generateEmbeddingText, EMBEDDING_MODEL } from "../gemini/embeddings";
import { createHash } from "crypto";
import type { DocumentType } from "../gemini/document-types";
import type { DocumentExtraction } from "../gemini/extract-document";

export interface SearchOptions {
  /** Minimum similarity threshold (0-1, default: 0.7) */
  threshold?: number;
  /** Maximum number of results (default: 10) */
  limit?: number;
  /** Filter by document type */
  documentType?: DocumentType;
}

export interface HybridSearchOptions {
  /** Maximum number of results (default: 10) */
  limit?: number;
  /** Weight for vector similarity (default: 0.7) */
  vectorWeight?: number;
  /** Weight for keyword matching (default: 0.3) */
  keywordWeight?: number;
  /** Minimum combined score threshold (default: 0.3) */
  minScore?: number;
  /** Filter by document type */
  documentType?: DocumentType;
}

export interface SearchResult {
  id: string;
  fileName: string;
  documentType: string | null;
  similarity: number;
  rawText: string | null;
  extraction: Record<string, unknown>;
  createdAt: string;
}

export interface HybridSearchResult {
  id: string;
  fileName: string;
  documentType: string | null;
  score: number;
  vectorScore: number;
  keywordScore: number;
  rawText: string | null;
  extraction: Record<string, unknown>;
  createdAt: string;
}

export interface SearchResponse {
  success: true;
  results: SearchResult[];
  query: string;
  options: SearchOptions;
  processingTimeMs: number;
}

export interface SearchError {
  success: false;
  error: string;
  query: string;
}

export type SemanticSearchResult = SearchResponse | SearchError;

export interface HybridSearchResponse {
  success: true;
  results: HybridSearchResult[];
  query: string;
  options: HybridSearchOptions;
  processingTimeMs: number;
}

export type HybridSearchResultType = HybridSearchResponse | SearchError;

/**
 * Search documents by semantic similarity
 *
 * @param query - Natural language search query
 * @param options - Search options (threshold, limit, documentType)
 * @returns Promise resolving to search results ranked by similarity
 */
export async function searchDocuments(
  query: string,
  options: SearchOptions = {}
): Promise<SemanticSearchResult> {
  const startTime = Date.now();
  const { threshold = 0.7, limit = 10, documentType } = options;

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      error: "Search query cannot be empty",
      query,
    };
  }

  // Step 1: Generate embedding for query
  const embeddingResult = await generateEmbedding(query);

  if (!embeddingResult.success) {
    return {
      success: false,
      error: `Failed to generate query embedding: ${embeddingResult.error}`,
      query,
    };
  }

  // Step 2: Call Supabase RPC function
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase.rpc("search_documents", {
      query_embedding: `[${embeddingResult.embedding.join(",")}]`,
      match_threshold: threshold,
      match_count: limit,
      filter_document_type: documentType || null,
    });

    if (error) {
      return {
        success: false,
        error: `Database search failed: ${error.message}`,
        query,
      };
    }

    // Transform results to camelCase
    const results: SearchResult[] = (data || []).map((row: {
      id: string;
      file_name: string;
      document_type: string | null;
      similarity: number;
      raw_text: string | null;
      extraction: Record<string, unknown>;
      created_at: string;
    }) => ({
      id: row.id,
      fileName: row.file_name,
      documentType: row.document_type,
      similarity: row.similarity,
      rawText: row.raw_text,
      extraction: row.extraction,
      createdAt: row.created_at,
    }));

    return {
      success: true,
      results,
      query,
      options: { threshold, limit, documentType },
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Search failed: ${errorMessage}`,
      query,
    };
  }
}

/**
 * Hybrid search combining vector similarity and keyword matching
 *
 * @param query - Natural language search query
 * @param options - Search options (limit, vectorWeight, keywordWeight, minScore, documentType)
 * @returns Promise resolving to search results ranked by combined score
 */
export async function hybridSearchDocuments(
  query: string,
  options: HybridSearchOptions = {}
): Promise<HybridSearchResultType> {
  const startTime = Date.now();
  const {
    limit = 10,
    vectorWeight = 0.7,
    keywordWeight = 0.3,
    minScore = 0.3,
    documentType,
  } = options;

  if (!query || query.trim().length === 0) {
    return {
      success: false,
      error: "Search query cannot be empty",
      query,
    };
  }

  // Validate weights
  if (vectorWeight < 0 || vectorWeight > 1 || keywordWeight < 0 || keywordWeight > 1) {
    return {
      success: false,
      error: "Weights must be between 0 and 1",
      query,
    };
  }

  // Step 1: Generate embedding for query
  const embeddingResult = await generateEmbedding(query);

  if (!embeddingResult.success) {
    return {
      success: false,
      error: `Failed to generate query embedding: ${embeddingResult.error}`,
      query,
    };
  }

  // Step 2: Call Supabase RPC function for hybrid search
  const supabase = getSupabase();

  try {
    const { data, error } = await supabase.rpc("hybrid_search_documents", {
      query_text: query,
      query_embedding: `[${embeddingResult.embedding.join(",")}]`,
      match_count: limit,
      vector_weight: vectorWeight,
      keyword_weight: keywordWeight,
      min_score: minScore,
      filter_document_type: documentType || null,
    });

    if (error) {
      return {
        success: false,
        error: `Database search failed: ${error.message}`,
        query,
      };
    }

    // Transform results to camelCase
    const results: HybridSearchResult[] = (data || []).map((row: {
      id: string;
      file_name: string;
      document_type: string | null;
      score: number;
      vector_score: number;
      keyword_score: number;
      raw_text: string | null;
      extraction: Record<string, unknown>;
      created_at: string;
    }) => ({
      id: row.id,
      fileName: row.file_name,
      documentType: row.document_type,
      score: row.score,
      vectorScore: row.vector_score,
      keywordScore: row.keyword_score,
      rawText: row.raw_text,
      extraction: row.extraction,
      createdAt: row.created_at,
    }));

    return {
      success: true,
      results,
      query,
      options: { limit, vectorWeight, keywordWeight, minScore, documentType },
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Hybrid search failed: ${errorMessage}`,
      query,
    };
  }
}

/**
 * Update document embedding
 *
 * @param documentId - Document ID to update
 * @param embedding - 768-dimensional embedding vector
 * @returns Promise resolving to success status
 */
export async function updateDocumentEmbedding(
  documentId: string,
  embedding: number[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  try {
    const { error } = await supabase
      .from("documents")
      .update({ embedding: `[${embedding.join(",")}]` })
      .eq("id", documentId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

export interface EmbeddingDocumentInput {
  document_type: string;
  raw_text: string | null;
  extraction: DocumentExtraction | Record<string, unknown>;
}

type EmbeddingDeps = {
  fetchEmbeddingByKey: (key: string) => Promise<{ embedding: number[] } | null>;
  generateEmbedding: typeof generateEmbedding;
  updateDocumentEmbedding: typeof updateDocumentEmbedding;
  updateEmbeddingCache: (key: string, embedding: number[]) => Promise<void>;
};

function normalizeEmbeddingText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function buildEmbeddingKey(text: string): string {
  const normalized = normalizeEmbeddingText(text);
  return createHash("sha256").update(`${EMBEDDING_MODEL}:${normalized}`).digest("hex");
}

async function fetchEmbeddingByKey(
  key: string
): Promise<{ embedding: number[] } | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("embedding_cache")
    .select("embedding")
    .eq("embedding_key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch embedding cache: ${error.message}`);
  }
  if (!data) return null;

  const raw = data.embedding;
  if (Array.isArray(raw)) {
    return { embedding: raw as number[] };
  }
  if (typeof raw === "string") {
    const parsed = raw.replace(/[\[\]]/g, "").split(",").map((v) => Number(v.trim()));
    return { embedding: parsed };
  }

  return null;
}

async function updateEmbeddingCache(
  key: string,
  embedding: number[]
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("embedding_cache")
    .insert({
      embedding_key: key,
      embedding: `[${embedding.join(",")}]`,
    });

  if (error && error.code !== "23505") {
    throw new Error(`Failed to insert embedding cache: ${error.message}`);
  }
}

/**
 * Generate and store embedding for a document
 *
 * Uses structured extraction data combined with raw text for better semantic search.
 *
 * @param documentId - Document ID
 * @param document - Document with type, raw_text, and extraction
 * @returns Promise resolving to success status with processing time
 */
export async function generateAndStoreEmbedding(
  documentId: string,
  document: EmbeddingDocumentInput
): Promise<{ success: boolean; error?: string; processingTimeMs?: number }> {
  return generateAndStoreEmbeddingWithDeps(documentId, document, {
    fetchEmbeddingByKey,
    generateEmbedding,
    updateDocumentEmbedding,
    updateEmbeddingCache,
  });
}

export async function generateAndStoreEmbeddingWithDeps(
  documentId: string,
  document: EmbeddingDocumentInput,
  deps: EmbeddingDeps
): Promise<{ success: boolean; error?: string; processingTimeMs?: number }> {
  // Generate enriched text combining structured data + raw text
  const embeddingText = generateEmbeddingText(document);
  const embeddingKey = buildEmbeddingKey(embeddingText);

  try {
    const cached = await deps.fetchEmbeddingByKey(embeddingKey);
    if (cached?.embedding?.length) {
      const updateResult = await deps.updateDocumentEmbedding(documentId, cached.embedding);
      if (!updateResult.success) {
        return { success: false, error: updateResult.error };
      }
      return { success: true };
    }
  } catch (error) {
    console.warn(`Embedding cache lookup warning: ${error instanceof Error ? error.message : String(error)}`);
  }

  const embeddingResult = await deps.generateEmbedding(embeddingText);

  if (!embeddingResult.success) {
    return { success: false, error: embeddingResult.error };
  }

  const updateResult = await deps.updateDocumentEmbedding(documentId, embeddingResult.embedding);

  if (!updateResult.success) {
    return { success: false, error: updateResult.error };
  }

  try {
    await deps.updateEmbeddingCache(embeddingKey, embeddingResult.embedding);
  } catch (error) {
    console.warn(`Embedding cache insert warning: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    success: true,
    processingTimeMs: embeddingResult.processingTimeMs,
  };
}
