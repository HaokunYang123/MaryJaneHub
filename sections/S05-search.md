# S05 — Search & Discovery

## Status: Done

## Intent

Provide semantic and hybrid search over processed documents. Support natural language queries with automatic filter extraction (date, vendor, amount, document type). Collapse duplicate results to canonical documents.

**Success criteria:** A natural language query like "invoices from ABC Corp over $5000 in January" returns relevant results ranked by combined vector + keyword score, with duplicates collapsed.

**Non-goals:** Saved searches. Search analytics. Faceted filtering UI (filters are extracted from query text).

## Contract

**ContractVersion: v1**

### GET /api/documents/search

Auth: `verifyAuth()`

```typescript
// Query params
{
  q: string,                    // required
  mode?: "hybrid" | "vector",   // default: "hybrid"
  limit?: number,               // 1-50, default: 10
  type?: DocumentType,          // filter
  includeHighlight?: boolean,
  includeLocation?: boolean,
  // Hybrid mode:
  vectorWeight?: number,        // 0-1, default: 0.7
  keywordWeight?: number,       // 0-1, default: 0.3
  minScore?: number,            // 0-1, default: 0.3
  // Vector mode:
  threshold?: number,           // 0-1, default: 0.7
  collapseDuplicates?: boolean  // default: true
}

// Response
{
  success: true,
  data: {
    mode: "hybrid" | "vector",
    results: Array<{
      id: string,
      score: number,
      documentType: string,
      extraction: object,
      highlight?: { text: string, page?: number, coords?: BoundingBox },
      duplicateCount?: number,
      duplicateIds?: string[]
    }>,
    query: string,
    options: object,
    collapseDuplicates: boolean,
    processingTimeMs: number
  }
}
```

### Search modes

- **Hybrid** (default): vector similarity (weight 0.7) + keyword FTS (weight 0.3), combined ranking
- **Vector**: pure semantic similarity with threshold cutoff

### Query parsing

Natural language → structured filters:
- Date: "in January 2025" → dateFrom/dateTo
- Amount: "over $5000" → minAmount
- Vendor: "from ABC Corp" → vendor filter
- Type: "invoices" → documentType
- Remainder → semantic query text

### Duplicate collapse

- Groups by content hash or high similarity
- Canonical selection: highest confidence → newest → AI-managed root
- Returns canonical result with duplicateCount + duplicateIds

## Proof

1. Query "invoices" returns only documents with documentType = "invoice".
2. Hybrid search returns results sorted by combined score (vector × weight + keyword × weight).
3. Two documents with identical content hash appear as one result with duplicateCount = 2 when collapseDuplicates = true.
4. Query with no matches returns empty results array, not an error.
5. Response includes processingTimeMs.

## Depends On

- S02 (documents with embeddings in pgvector)
- ADR-001 (service key for DB queries)

## Files

- `lib/search/semantic-search.ts` — vector + hybrid search
- `lib/search/smart-search.ts` — high-level interface
- `lib/search/parse-query.ts` — natural language → structured filters
- `lib/search/deduplicate.ts` — duplicate collapse
- `lib/search/highlight.ts` — result highlighting
- `app/api/documents/search/route.ts`
