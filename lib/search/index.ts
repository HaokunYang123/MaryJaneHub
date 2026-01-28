/**
 * Semantic Search Module
 *
 * Provides semantic search capabilities using Gemini embeddings
 * and Supabase pgvector. Supports both vector-only and hybrid search.
 */

export {
  // Vector-only search
  searchDocuments,
  type SearchOptions,
  type SearchResult,
  type SearchResponse,
  type SemanticSearchResult,
  // Hybrid search (vector + keyword)
  hybridSearchDocuments,
  type HybridSearchOptions,
  type HybridSearchResult,
  type HybridSearchResponse,
  type HybridSearchResultType,
  // Utilities
  updateDocumentEmbedding,
  generateAndStoreEmbedding,
  type SearchError,
} from "./semantic-search";
