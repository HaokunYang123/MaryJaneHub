-- Add document classification fields to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'other';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS classification_confidence DECIMAL(5,4);

-- Create index for document type filtering
CREATE INDEX IF NOT EXISTS idx_documents_document_type ON documents(document_type);
