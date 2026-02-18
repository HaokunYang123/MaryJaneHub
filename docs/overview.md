# Mary Jane Hub — Document AI System

## Context

A financial document management system for a 70-year-old entrepreneur managing 8+ business entities across cannabis and real estate industries. Primary goal: create a "Clean Data Room" to support exit strategy when selling companies, enabling lawyers to conduct efficient legal due diligence. System must meet legal compliance requirements with proper audit trails and immutable archival.

## What

A full-stack document intelligence platform that automates financial document processing. Users drop documents (invoices, receipts, bank statements, contracts, tax forms) into a Google Drive inbox; the system automatically extracts structured data with field-level evidence, runs a review workflow, and syncs approved items to QuickBooks.

## Stack

- **Frontend**: Next.js 16 (React 19), TypeScript
- **Database**: Supabase (PostgreSQL 15+ with pgvector)
- **OCR**: Google Document AI
- **LLM**: Gemini (classification, extraction, embeddings)
- **Storage**: Google Cloud Storage (archive + working)
- **Integrations**: Google Drive (inbox), QuickBooks Online (sync)
- **Auth**: Supabase Auth (Google OAuth) + email whitelist

## Architecture

```
Google Drive Inbox
       ↓
[Cron: process-inbox]
       ↓
┌──────────────────────────────────────────────┐
│  Processing Pipeline                          │
│  OCR → Classify → Extract → Evidence → Embed │
└──────────────────────────────────────────────┘
       ↓
   Supabase DB ←→ GCS Archive (WORM)
       ↓
┌──────────────────────────────────────────────┐
│  Review Workflow                              │
│  auto-approve (≥95%) | pending | needs-attention │
└──────────────────────────────────────────────┘
       ↓
   QuickBooks Sync (idempotent)
```

**Key modules:**
- `/lib/pipeline/` — Document processing pipeline
- `/lib/gemini/` — LLM extraction & classification (7 doc types)
- `/lib/workflow/` — Approval workflow & sync
- `/lib/assistant/` — Smart query router (search, single-qa, sum, rag)
- `/lib/audit/` — Evidence packet generation
- `/app/api/` — 19 REST endpoints (all auth-protected)

## Phases

- [x] Phase 1 (M1): Security + Review Loop + Lawyer Evidence
- [x] Phase 2 (M2): Backend Ops & Trust (evidence backfill, API contracts)
- [x] Phase 3 (M3): Backend Validation (accuracy, security audit, speed floors)
- [ ] Phase 4: TBD — Frontend polish / Bank connectors / Production hardening
- [x] Phase 5: Evidence Coordinates (Document AI)
- [x] Phase 6: Storage Hardening (Archive + Working)
- [x] Phase 7: Batch OCR + Backfill Performance
