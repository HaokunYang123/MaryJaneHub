-- Add full-text search support for hybrid search
-- Combines vector similarity with keyword matching for better results

-- Add generated tsvector column for full-text search
ALTER TABLE documents ADD COLUMN IF NOT EXISTS raw_text_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', COALESCE(raw_text, ''))) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS documents_raw_text_tsv_idx ON documents USING gin(raw_text_tsv);

-- Create hybrid search function combining vector and keyword search
CREATE OR REPLACE FUNCTION hybrid_search_documents(
  query_text text,
  query_embedding vector(768),
  match_count int DEFAULT 10,
  vector_weight float DEFAULT 0.7,
  keyword_weight float DEFAULT 0.3,
  min_score float DEFAULT 0.3,
  filter_document_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_name text,
  document_type text,
  score float,
  vector_score float,
  keyword_score float,
  raw_text text,
  extraction jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT
      d.id,
      1 - (d.embedding <=> query_embedding) as v_score
    FROM documents d
    WHERE d.embedding IS NOT NULL
  ),
  keyword_results AS (
    SELECT
      d.id,
      ts_rank_cd(d.raw_text_tsv, plainto_tsquery('english', query_text)) as k_score
    FROM documents d
    WHERE d.raw_text_tsv @@ plainto_tsquery('english', query_text)
  ),
  combined AS (
    SELECT
      d.id,
      d.file_name,
      d.document_type,
      d.raw_text,
      d.extraction,
      d.created_at,
      COALESCE(v.v_score, 0) as vector_score,
      COALESCE(k.k_score, 0) as keyword_score,
      (COALESCE(v.v_score, 0) * vector_weight) +
      (COALESCE(k.k_score, 0) * keyword_weight) as combined_score
    FROM documents d
    LEFT JOIN vector_results v ON d.id = v.id
    LEFT JOIN keyword_results k ON d.id = k.id
    WHERE d.embedding IS NOT NULL
      AND (v.v_score IS NOT NULL OR k.k_score IS NOT NULL)
      AND (filter_document_type IS NULL OR d.document_type = filter_document_type)
  )
  SELECT
    c.id,
    c.file_name,
    c.document_type,
    c.combined_score as score,
    c.vector_score,
    c.keyword_score,
    c.raw_text,
    c.extraction,
    c.created_at
  FROM combined c
  WHERE c.combined_score > min_score
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$;

-- Add comments for documentation
COMMENT ON COLUMN documents.raw_text_tsv IS 'Generated tsvector for full-text search on raw_text';
COMMENT ON FUNCTION hybrid_search_documents IS 'Hybrid search combining vector similarity and keyword matching with configurable weights';
