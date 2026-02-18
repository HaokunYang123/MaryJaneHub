-- QuickBooks idempotency mapping table
-- Prevents duplicate object creation on retries/reruns

CREATE TABLE IF NOT EXISTS qb_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id),
  qb_object_type TEXT NOT NULL,
  qb_object_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_idempotency_key ON qb_idempotency(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_qb_idempotency_document ON qb_idempotency(document_id);

COMMENT ON TABLE qb_idempotency IS 'QuickBooks idempotency mapping to prevent duplicate object creation';
COMMENT ON COLUMN qb_idempotency.document_id IS 'Local document ID associated with the QuickBooks object';
COMMENT ON COLUMN qb_idempotency.qb_object_type IS 'QuickBooks object type (e.g., bill)';
COMMENT ON COLUMN qb_idempotency.qb_object_id IS 'QuickBooks object ID';
COMMENT ON COLUMN qb_idempotency.idempotency_key IS 'Deterministic idempotency key for deduplication';
