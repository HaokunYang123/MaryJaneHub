/**
 * Search Module
 *
 * Provides semantic search capabilities using Gemini embeddings
 * and Supabase pgvector. Supports vector-only, hybrid, and smart search.
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

// Smart search (structured + semantic)
export {
  smartSearch,
  type SmartSearchResult,
  type SmartSearchResponse,
  type SmartSearchError,
  type SmartSearchResultType,
} from "./smart-search";

// Query parser
export {
  parseQuery,
  formatParsedQuery,
  type ParsedQuery,
} from "./parse-query";
