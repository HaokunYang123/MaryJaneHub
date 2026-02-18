# Mary Jane Hub — Document AI System

## What
A full-stack document intelligence platform that automates financial document processing for 8+ business entities. Drop documents into Google Drive inbox; system extracts structured data with field-level evidence, runs review workflow, and syncs approved items to QuickBooks.

## Stack
- Next.js 16 (React 19), TypeScript
- Supabase (PostgreSQL 15+ with pgvector)
- Google Document AI (OCR)
- Gemini (classification, extraction, embeddings)
- Google Cloud Storage (archive + working)
- Google Drive (inbox), QuickBooks Online (sync)
- Supabase Auth (Google OAuth) + email whitelist

## Commands

### Development
```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run start        # Start production server
```

### Testing & Validation
```bash
npm run test:pipeline     # Test full pipeline
npm run test:full         # Full integration test
npm run benchmark         # Run full benchmark suite
npm run benchmark:quick   # Quick benchmark
npm run assistant:test    # Assistant router regression tests
npm run test:search       # Semantic search tests
npm run test:search:dedupe  # Duplicate collapse tests
npm run healthcheck       # System health check
```

### Worker & Queue
```bash
npm run worker            # Run processing worker
npm run worker:only       # Worker only (no cron)
npm run worker:retry-failed  # Retry failed jobs
npm run test:queue        # Test queue system
```

### Data Operations
```bash
npm run embeddings:backfill   # Backfill embeddings
npm run evidence:backfill     # Backfill field evidence
npm run reset:dry             # Dry-run data reset
npm run reset:execute         # Execute data reset (DESTRUCTIVE)
npm run export                # Export data
```

### QuickBooks
```bash
npm run qb:api                    # Test QB API
npm run test:qb:idempotency       # Test QB idempotency
```

### Drive
```bash
npm run test:drive           # Test Drive access
npm run rename:dry           # Dry-run file rename
npm run rename:execute       # Execute file rename
```

### Search & Assistant
```bash
npm run search               # CLI search interface
npm run assistant            # CLI assistant interface
npm run test:chat            # Test chat intent
```

## Project Structure

```
/app/api/              — 19 REST endpoints (all auth-protected)
  /documents/          — Document CRUD, search, preview, review, sync
  /assistant/          — Unified chat endpoint with intent routing
  /admin/drive/        — Drive corpus, metadata, organize APIs
/lib/
  /pipeline/           — Document processing pipeline
  /gemini/             — LLM extraction & classification (7 doc types)
  /workflow/           — Approval workflow & sync
  /assistant/          — Smart query router (search, single-qa, sum, rag, chat)
  /search/             — Semantic + keyword hybrid search
  /audit/              — Evidence packet generation
/components/
  /documents/          — Documents workspace UI
  /layout/             — App shell, AI rail, preview drawer
/docs/
  /overview.md         — Project scope and architecture
  /phase-current.md    — Active tasks with acceptance criteria
  /decisions.md        — Technical decisions (newest first)
  /ops/                — Operational docs (founder-todo, drive-strategy, etc.)
```

## Key Patterns

### Document Processing
- OCR → Classify → Extract → Evidence → Embed
- Review workflow: auto-approve (≥95%) | pending | needs-attention
- QuickBooks sync: idempotent with snapshot lock and reconciliation

### API Security
- All endpoints require auth (`verifyAuth` or `requireRole` middleware)
- Email whitelist for user access
- Role hierarchy: `admin` > `user` > `viewer`
- Write actions (approve/reject/sync) require `requireRole("user")`
- Admin endpoints: `requireAdmin()` — enforces secret-only when `ADMIN_SECRET` env is set
- Cron routes: bearer-token only (`CRON_SECRET`), no OAuth session fallback

### Data Integrity
- Sync snapshot lock at approval (freeze vendor/date/total)
- Pre-sync checklist gate (status, flags, required fields, evidence)
- Post-sync reconciliation (validate QB bill against snapshot)
- Archive storage is WORM (write-once-read-many)

### Drive Management
- Two-zone model: AI-managed roots vs user-managed areas
- AI-managed: auto-organize within approved entity roots
- User-managed: read + private metadata only (no auto-sort)
- Duplicate collapse in search (canonical result + duplicate metadata)

### Assistant Intent Routing
- 5 intents: search, single_qa, sum, rag, chat
- Rule-based classification with Gemini model fallback
- Context carry-over for elliptical follow-ups
- Source cards only for answer-type responses

### Error Handling
- Worker: adaptive concurrency with throttle backoff
- Gemini: structured output with finish-reason retries
- Extraction: key-field fallback for low-confidence results
- Pipeline: per-step timing and bottleneck tracking

## Current Phase
Phase 7: Batch OCR + Backfill Performance
- Focus: High-quality backfill with low OCR cost via dedupe and adaptive throughput
- See `/docs/phase-current.md` for active tasks

## Related Docs
- `/AGENTS.md` — Working conventions and project-specific rules
- `/docs/overview.md` — Scope, stack, architecture, phase list
- `/docs/decisions.md` — Technical decisions and key learnings
- `/docs/ops/founder-todo.md` — Owner action checklist
- `/docs/ops/drive-management-strategy.md` — Drive AI-management strategy
