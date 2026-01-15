-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

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

-- 3. Documents Table (for RAG)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  content text,
  embedding vector(1536),
  metadata jsonb, -- { "type": "invoice", "vendor": "Home Depot", "date": "..." }
  created_at timestamptz default now()
);

-- Index for vector search
create index on documents using hnsw (embedding vector_cosine_ops);
