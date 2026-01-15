-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;
create extension if not exists "uuid-ossp";

-- 1. Companies Table
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  realm_id text not null unique,
  name text,
  created_at timestamptz default now()
);

-- 2. Transactions Table
create type transaction_source as enum ('quickbooks', 'plaid');

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  realm_id text references companies(realm_id),
  date date not null,
  amount numeric not null,
  vendor text,
  category text,
  source transaction_source not null,
  external_id text, -- ID from QB or Plaid
  is_reconciled boolean default false,
  created_at timestamptz default now(),
  unique(source, external_id)
);

-- 3. ENUM for strict document state management
CREATE TYPE document_status AS ENUM ('needs_review', 'processed', 'rejected');

-- 4. Documents Table (Enhanced for Trust but Verify workflow)
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  drive_id TEXT NOT NULL,
  content TEXT, -- OCR text content
  category TEXT,
  
  -- Vector embedding for RAG search
  embedding vector(1536),
  
  -- The "Brain" of the file - Stores the AI analysis (Vendor, Amount, Confidence)
  metadata JSONB,
  
  -- The "Guardrails" for Trust but Verify
  status document_status DEFAULT 'needs_review',
  is_duplicate BOOLEAN DEFAULT FALSE,
  duplicate_of_id UUID REFERENCES documents(id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Index for vector search
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING hnsw (embedding vector_cosine_ops);

-- Index for fast duplicate checking on amounts and vendors
CREATE INDEX IF NOT EXISTS idx_documents_metadata_vendor ON documents ((metadata->>'vendorName'));
CREATE INDEX IF NOT EXISTS idx_documents_metadata_amount ON documents ((metadata->>'amount'));
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status);
