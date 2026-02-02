-- GCS archive metadata for immutable evidence tracking
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS gcs_bucket TEXT,
  ADD COLUMN IF NOT EXISTS gcs_object TEXT,
  ADD COLUMN IF NOT EXISTS gcs_generation TEXT,
  ADD COLUMN IF NOT EXISTS gcs_hash_type TEXT,
  ADD COLUMN IF NOT EXISTS gcs_hash_value TEXT,
  ADD COLUMN IF NOT EXISTS gcs_retention_status TEXT;

COMMENT ON COLUMN documents.gcs_bucket IS 'GCS bucket containing immutable archive object';
COMMENT ON COLUMN documents.gcs_object IS 'GCS object name/path for immutable archive';
COMMENT ON COLUMN documents.gcs_generation IS 'GCS object generation/version for WORM reference';
COMMENT ON COLUMN documents.gcs_hash_type IS 'GCS-provided hash type (md5/crc32c) if available';
COMMENT ON COLUMN documents.gcs_hash_value IS 'GCS-provided hash value if available';
COMMENT ON COLUMN documents.gcs_retention_status IS 'Retention status: confirmed/unconfirmed';
