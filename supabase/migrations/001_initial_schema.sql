-- Documents table: stores all processed files
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- File identification
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,  -- SHA256, prevents duplicates
  mime_type TEXT,

  -- Storage references
  gcs_path TEXT,  -- gs://bucket/path
  drive_file_id TEXT,  -- original Google Drive ID (for later)

  -- OCR results
  ocr_confidence DECIMAL(5,4),
  raw_text TEXT,

  -- Extracted data (the good stuff)
  extraction JSONB NOT NULL,
  extraction_confidence DECIMAL(5,4),

  -- Human corrections
  human_overrides JSONB,  -- if Mary corrects something

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | approved | synced | error

  -- QuickBooks sync
  qb_bill_id TEXT,  -- filled after sync to QuickBooks

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

-- Index for fast lookups
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_file_hash ON documents(file_hash);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- Audit logs table: tracks all actions for legal compliance
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was affected
  document_id UUID REFERENCES documents(id),

  -- Who did it
  actor TEXT NOT NULL,  -- user email or 'system'

  -- What happened
  action TEXT NOT NULL,  -- 'created' | 'approved' | 'modified' | 'synced' | 'error'

  -- Before/after snapshot for modifications
  before_data JSONB,
  after_data JSONB,

  -- Additional context
  notes TEXT,

  -- When
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_document_id ON audit_logs(document_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
