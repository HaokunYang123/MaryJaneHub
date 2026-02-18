-- Store OCR layout data for evidence coordinates
CREATE TABLE IF NOT EXISTS document_layouts (
  document_id UUID PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  layout JSONB NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  layout_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_layouts_document_id_idx
  ON document_layouts (document_id);

COMMENT ON TABLE document_layouts IS 'Document AI layout data (lines + bounding boxes) for evidence coordinates';
COMMENT ON COLUMN document_layouts.layout IS 'OCR layout JSON (normalized coordinates + text anchor segments)';
COMMENT ON COLUMN document_layouts.pages IS 'Number of pages in the OCR layout';
COMMENT ON COLUMN document_layouts.layout_version IS 'Layout schema version';
