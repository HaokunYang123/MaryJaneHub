-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id text NOT NULL UNIQUE,
  name text,
  created_at timestamptz DEFAULT now()
);

-- 2. Transaction Source Type (only create if not exists)
DO $$ BEGIN
  CREATE TYPE transaction_source AS ENUM ('quickbooks', 'plaid');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id text REFERENCES companies(realm_id),
  date date NOT NULL,
  amount numeric NOT NULL,
  vendor text,
  category text,
  source transaction_source NOT NULL,
  external_id text,
  is_reconciled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source, external_id)
);

-- 4. Document Status Type (only create if not exists)
DO $$ BEGIN
  CREATE TYPE document_status AS ENUM ('needs_review', 'processed', 'rejected', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5. Documents Table (Trust but Verify workflow)
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  drive_id TEXT NOT NULL,
  content TEXT,
  category TEXT,
  embedding vector(1536),
  metadata JSONB,
  status document_status DEFAULT 'needs_review',
  is_duplicate BOOLEAN DEFAULT FALSE,
  duplicate_of_id UUID REFERENCES documents(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
CREATE INDEX IF NOT EXISTS idx_documents_drive_id ON documents (drive_id);

-- Create indexes for metadata fields (these might fail if they exist, that's ok)
DO $$ BEGIN
  CREATE INDEX idx_documents_metadata_vendor ON documents ((metadata->>'vendorName'));
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX idx_documents_metadata_amount ON documents ((metadata->>'amount'));
EXCEPTION
  WHEN duplicate_table THEN null;
END $$;
