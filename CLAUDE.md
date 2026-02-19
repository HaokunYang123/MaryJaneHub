# Mary Jane Hub — Operational Instructions

> Project facts (goal, architecture, contracts, decisions) live in `PROJECT.md`, `sections/`, and `decisions/`. This file is for operational instructions only.

## Commands

### Development
```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build (also the check command)
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

## Quick Navigation

```
PROJECT.md             — Project truth: goal, stack, sections table, ADRs
sections/              — Section notes (S01-S10): Intent, Contract, Proof
decisions/             — ADRs for cross-section decisions

app/api/               — REST endpoints
lib/                   — Core business logic (pipeline, workflow, search, assistant, etc.)
components/            — React UI components
supabase/migrations/   — Database schema (001-016)
scripts/               — Operational scripts
docs/ops/              — Operational docs (runbooks, checklists, strategy notes)
docs/legal/            — Legal reference docs
```

## Conventions

- All code, comments, logs, and documentation in English
- No Chinese in code or scripts
- When resetting `processing_jobs` from `processing` to `pending`, also clear `steps_completed`
- For `@google/genai` structured JSON calls, use default/beta endpoints (not forced `v1`)
- Gemini text-embedding-001 returns 768-dim vectors; pgvector index must match
- Google Document AI has separate processor IDs per region; use `us` for US deployment
- QuickBooks sandbox tokens expire every hour; refresh logic is mandatory
- Field evidence page numbers are 1-indexed (from Document AI), not 0-indexed
