-- Add sync workflow columns to documents table
-- Supports confidence-based auto-approval and QuickBooks sync tracking

-- Sync status enum-like column
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'not_applicable';

-- Confidence score from extraction (0.0000 to 1.0000)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS confidence_score DECIMAL(5,4);

-- Review flags as JSON array
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS review_flags JSONB DEFAULT '[]'::jsonb;

-- QuickBooks references
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS qb_vendor_id TEXT;

-- Note: qb_bill_id column already exists from initial migration
-- If it doesn't exist, uncomment:
-- ALTER TABLE documents ADD COLUMN IF NOT EXISTS qb_bill_id TEXT;

-- Review tracking
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

-- Sync tracking
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

ALTER TABLE documents
ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_sync_status ON documents(sync_status);
CREATE INDEX IF NOT EXISTS idx_documents_confidence ON documents(confidence_score);
CREATE INDEX IF NOT EXISTS idx_documents_document_type_status ON documents(document_type, sync_status);

-- Comments
COMMENT ON COLUMN documents.sync_status IS 'Workflow status: not_applicable, auto_approved, pending_review, needs_attention, approved, rejected, synced, error';
COMMENT ON COLUMN documents.confidence_score IS 'Extraction confidence from 0 to 1';
COMMENT ON COLUMN documents.review_flags IS 'Array of review flags: vendor_not_found, high_amount, missing_field, duplicate_invoice, low_confidence';
COMMENT ON COLUMN documents.qb_vendor_id IS 'QuickBooks vendor ID after sync';
COMMENT ON COLUMN documents.reviewed_at IS 'Timestamp when document was reviewed/approved';
COMMENT ON COLUMN documents.reviewed_by IS 'User who reviewed/approved the document';
COMMENT ON COLUMN documents.synced_at IS 'Timestamp when document was synced to QuickBooks';
COMMENT ON COLUMN documents.sync_error IS 'Error message if sync failed';
