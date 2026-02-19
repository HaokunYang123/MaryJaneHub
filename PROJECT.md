# Mary Jane Hub

## Goal

Document intelligence platform for 8+ business entities (cannabis + real estate). Automates financial document processing: Google Drive inbox → OCR → classify → extract structured data → review workflow → QuickBooks sync. Includes semantic search, conversational AI assistant, and data export for due diligence.

## Tech Stack

- **Runtime:** Next.js 16, React 19, TypeScript
- **Database:** Supabase (PostgreSQL 15+ with pgvector)
- **OCR:** Google Document AI
- **LLM:** Gemini (`@google/genai` SDK) — classification, extraction, embeddings, chat
- **Storage:** Google Cloud Storage (WORM archive), Google Drive (inbox + corpus)
- **Integrations:** QuickBooks Online (bill sync), Supabase Auth (Google OAuth)

## Check Command

```bash
npm run build
```

## Constraints

- All DB operations use service key, bypassing RLS — design decision (see ADR-001)
- Email whitelist controls user access; no self-registration
- Archive storage is WORM (write-once-read-many); files cannot be modified after upload
- QB sync is idempotent via reservation pattern; concurrent syncs are safe
- Cron routes require bearer token only; no OAuth session fallback

## Dependencies

| External Service | Purpose |
|-----------------|---------|
| Google Document AI | OCR extraction + layout |
| Gemini API | Classification, extraction, embeddings, chat |
| Google Cloud Storage | Archive (WORM) + working storage |
| Google Drive API | Inbox polling, corpus management, file organization |
| QuickBooks Online API | Bill creation, vendor management, reconciliation |
| Supabase | PostgreSQL database, Auth (Google OAuth), pgvector |

## Sections

| ID | Name | Status | Depends On |
|----|------|--------|------------|
| S01 | Auth & Security | Done | — |
| S02 | Document Processing Pipeline | Done | S01, ADR-001 |
| S03 | Review & Approval | Done | S01, S02, ADR-001, ADR-002 |
| S04 | QuickBooks Integration | Done | S01, S03, ADR-001, ADR-002 |
| S05 | Search & Discovery | Done | S02, ADR-001 |
| S06 | AI Assistant | Done | S05, S01 |
| S07 | Documents UI | Done | S02, S03, S05 |
| S08 | AI Copilot UI | Done | S06 |
| S09 | Admin Operations | Done | S01, ADR-001, ADR-002, ADR-003 |
| S10 | Data Export | Done | S01, S02, ADR-001 |

## ADRs

| ID | Title | Affected Sections |
|----|-------|-------------------|
| ADR-001 | Service Key Bypasses RLS | S02, S03, S04, S05, S06, S09, S10 |
| ADR-002 | Role Hierarchy (admin > user > viewer) | S01, S03, S04, S09 |
| ADR-003 | Drive Two-Zone Model | S02, S09 |
| ADR-004 | Audit Logging Convention | S03, S04, S06, S09 |
