-- Embedding cache table for deduplication

CREATE TABLE IF NOT EXISTS embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  embedding_key TEXT NOT NULL,
  embedding TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_cache_key ON embedding_cache(embedding_key);

COMMENT ON TABLE embedding_cache IS 'Embedding cache keyed by deterministic embedding_key to avoid recomputation';
COMMENT ON COLUMN embedding_cache.embedding_key IS 'SHA256 of model + normalized text';
