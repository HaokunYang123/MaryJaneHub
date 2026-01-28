-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (Gemini text-embedding-004 outputs 768 dimensions)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding vector(768);

-- Create index for fast similarity search using IVFFlat
-- lists = 100 is good for up to ~100k documents
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create search function for semantic similarity search
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
  SELECT
    d.id,
    d.file_name,
    d.document_type,
    1 - (d.embedding <=> query_embedding) as similarity,
    d.raw_text,
    d.extraction,
    d.created_at
  FROM documents d
  WHERE d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
    AND (filter_document_type IS NULL OR d.document_type = filter_document_type)
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON COLUMN documents.embedding IS 'Gemini text-embedding-004 vector (768 dimensions) for semantic search';
COMMENT ON FUNCTION search_documents IS 'Search documents by semantic similarity using cosine distance';
