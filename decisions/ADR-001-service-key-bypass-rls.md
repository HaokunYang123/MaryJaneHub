# ADR-001 — Service Key Bypasses RLS

## Status: Accepted

## Context

All backend database operations go through a single Supabase client initialized with the service role key. This bypasses Row Level Security (RLS) policies entirely.

## Decision

Use service key for all server-side DB access. Do not implement RLS policies for application-level access control.

## Rationale

- Documents are system-owned, not user-owned. All authenticated users see all documents.
- The auth layer (S01) handles access control at the API level — role checks happen before any DB call.
- Implementing RLS for a single-tenant, whitelist-gated system adds complexity without security benefit.
- Pipeline and worker processes need unrestricted DB access for batch operations.

## Consequences

- No per-row access control. If a user passes auth, they can read/write any document via the API.
- Adding multi-tenant isolation later would require RLS policies and client-per-user changes.
- Security depends entirely on the API middleware layer (S01) being correct.

## Affected Sections

S02, S03, S04, S05, S06, S09, S10
