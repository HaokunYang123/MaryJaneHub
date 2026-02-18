-- Optimize vector search index: Replace IVFFlat with HNSW
--
-- IVFFlat with lists=100 is inefficient for small datasets (<1000 docs).
-- HNSW provides better performance for both small and large datasets
-- with consistent query times.
--
-- HNSW parameters:
-- - m = 16: Number of connections per layer (default, good balance)
-- - ef_construction = 64: Size of dynamic candidate list during build
--
-- For search, you can set ef_search via SET ivfflat.probes (default 40)

-- Drop the old IVFFlat index
DROP INDEX IF EXISTS documents_embedding_idx;

-- Create new HNSW index (faster for small datasets, scales well)
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx ON documents
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Also optimize the search_documents function to avoid computing similarity twice
CREATE OR REPLACE FUNCTION search_documents(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_document_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_name text,
  document_type text,
  similarity float,
  raw_text text,
  extraction jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH scored AS (
    SELECT
      d.id,
      d.file_name,
      d.document_type,
      d.raw_text,
      d.extraction,
      d.created_at,
      1 - (d.embedding <=> query_embedding) as sim
    FROM documents d
    WHERE d.embedding IS NOT NULL
      AND (filter_document_type IS NULL OR d.document_type = filter_document_type)
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count * 2  -- Fetch extra to filter by threshold
  )
  SELECT
    s.id,
    s.file_name,
    s.document_type,
    s.sim as similarity,
    s.raw_text,
    s.extraction,
    s.created_at
  FROM scored s
  WHERE s.sim > match_threshold
  ORDER BY s.sim DESC
  LIMIT match_count;
END;
$$;

COMMENT ON INDEX documents_embedding_hnsw_idx IS 'HNSW index for fast vector similarity search';
