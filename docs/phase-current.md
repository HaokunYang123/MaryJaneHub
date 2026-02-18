# Phase 7: Batch OCR + Backfill Performance — COMPLETE

## Goal
Backfill documents with high quality while keeping OCR cost low via dedupe and adaptive throughput. Ship production UI, AI copilot, QB sync hardening, and security fixes.

## Tasks (all done)

- [x] Adaptive worker concurrency with throttle backoff
- [x] Surface OCR error codes to worker
- [x] Add per-step timing + bottleneck summary
- [x] Fix Drive naming for partial success
- [x] Harden JSON parsing for Gemini responses
- [x] Improve extraction reliability (key-field fallback, per-type metrics)
- [x] Build structured-output reliability layer (finish-reason retries, bank-statement fallback)
- [x] Validate with live worker batch (43 jobs, 0 hard failures)
- [x] Migrate Gemini SDK to `@google/genai`
- [x] Validate full 163-file benchmark (163/163, avg 88.3% confidence, p95 51.6s)
- [x] Backfill runbook + priorities (`/docs/ops/backfill-runbook.md`)
- [x] Mitigate invoice MAX_TOKENS + extraction_failed tail
- [x] Add semantic search test cases
- [x] Add semantic search highlights + coordinates
- [x] Refine business filename convention (USD token, reference tokens)
- [x] Create customer alignment note (`/docs/ops/customer-alignment-note.md`)
- [x] Add pre-sync checklist gate for QuickBooks
- [x] Add QB duplicate preflight in sync workflow
- [x] Add sync snapshot lock
- [x] Enforce strict evidence at sync gate
- [x] Add post-sync reconciliation
- [x] Prune legacy backend from donor snapshot
- [x] Merge effortless frontend slice from legacy UI
- [x] Add backend foundation for Drive AI-management
- [x] Add duplicate-collapse in search results + regression test
- [x] Implement production documents workspace UI
- [x] Add secure document preview endpoint
- [x] Upgrade semantic search interaction UX (source cards → preview)
- [x] Convert preview to anchored overlay drawer
- [x] Globalize AI rail across app shell
- [x] Add unified assistant chat endpoint (`/api/assistant/chat`)
- [x] Polish preview-first document UX
- [x] Fix header/rail layering
- [x] UX validation (preview races, scroll, error recovery)
- [x] Add PDF highlight overlays with pdf.js
- [x] Add approve/reject review controls to preview panel
- [x] Add temporary collaboration boundary for parallel banking development
- [x] Redesign AI rail to workspace-style sidebar
- [x] Add business conversation intent (`chat` intent, conversational AI)
- [x] Fix broken search routing + unblock document intelligence (104/104 tests)
- [x] Fix source card filtering, sum vendor matching, markdown rendering, follow-up context
- [x] Security fixes Batch 1+2: auth middleware, role checks, QB idempotency race, cron hardening, GCS orphan prevention, env mutation removal

## Progress
All tasks complete. Phase 7 is done.

## Next
Start Phase 8. Candidate priorities (choose one):
- **Performance (Batch 3):** batchApprove N+1, Gemini rate limiter, token cost tracking, dead-letter queue alerts
- **Refactor (Batch 4):** split process-document.ts / DocumentsWorkspace / AiRail, add Zod validation
- **New feature:** Drive live validation, banking track integration, cross-browser QA
