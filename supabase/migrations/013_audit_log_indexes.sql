-- Add indexes for assistant audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at
  ON audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id
  ON audit_logs ((after_data->>'request_id'));

-- Optional: ensure document_id index exists (already in initial schema)
CREATE INDEX IF NOT EXISTS idx_audit_logs_document_id
  ON audit_logs (document_id);
