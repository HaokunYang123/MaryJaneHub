-- Fix: Update hybrid search function with explicit type casts
-- Run this after 006_hybrid_search.sql if you get type mismatch errors

CREATE OR REPLACE FUNCTION hybrid_search_documents(
  query_text text,
  query_embedding vector(768),
  match_count int DEFAULT 10,
  vector_weight double precision DEFAULT 0.7,
  keyword_weight double precision DEFAULT 0.3,
  min_score double precision DEFAULT 0.3,
  filter_document_type text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_name text,
  document_type text,
  score double precision,
  vector_score double precision,
  keyword_score double precision,
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
      (1 - (d.embedding <=> query_embedding))::double precision as v_score
    FROM documents d
    WHERE d.embedding IS NOT NULL
  ),
  keyword_results AS (
    SELECT
      d.id,
      ts_rank_cd(d.raw_text_tsv, plainto_tsquery('english', query_text))::double precision as k_score
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
      COALESCE(v.v_score, 0::double precision) as vec_score,
      COALESCE(k.k_score, 0::double precision) as kw_score,
      (COALESCE(v.v_score, 0::double precision) * vector_weight +
       COALESCE(k.k_score, 0::double precision) * keyword_weight)::double precision as combined_score
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
    c.vec_score as vector_score,
    c.kw_score as keyword_score,
    c.raw_text,
    c.extraction,
    c.created_at
  FROM combined c
  WHERE c.combined_score > min_score
  ORDER BY c.combined_score DESC
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION hybrid_search_documents IS 'Hybrid search combining vector similarity and keyword matching with configurable weights';
