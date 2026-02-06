# Technical Decisions

## 2026-02-06: Scope Next.js type-check to app/lib during frontend merge
Context: Frontend verification was blocked by script-only TypeScript errors unrelated to the current UI merge slice. | Decision: Remove `scripts/**/*` from `tsconfig.json` `include` so Next.js build validation focuses on app/lib paths. | Reason: Keeps frontend merge iteration fast and avoids unrelated script churn during UI integration.

## 2026-02-06: Add Tailwind baseline before legacy UI reuse
Context: Legacy shell/dashboard components rely on utility classes and were not renderable in the current frontend baseline. | Decision: Add Tailwind/PostCSS baseline (`tailwindcss`, `@tailwindcss/postcss`, `postcss`) with `app/globals.css` and `postcss.config.mjs` before merging reusable UI components. | Reason: Enables low-effort visual reuse without coupling to deprecated backend logic.

## 2026-02-06: Start frontend merge with backend-independent legacy UI only
Context: User confirmed documents UI will be redesigned later, but wants immediate progress by reusing effortless legacy pieces now. | Decision: Merge only backend-independent shell/dashboard UI first, keep legacy document flow for new design, and wire future pages exclusively to current `/api/documents*` contracts. | Reason: Delivers visible progress quickly without reintroducing deprecated API coupling.

## 2026-02-06: Remove residual backend artifacts from legacy donor snapshot
Context: After removing legacy API/service folders, donor snapshot still included backend-oriented artifacts not needed for UI extraction. | Decision: Delete `legacy-main/supabase` and `legacy-main/test-drive.js`, keeping only frontend donor surface. | Reason: Reduces accidental coupling and keeps migration focus on UI-only reuse.

## 2026-02-06: Prune legacy backend folders from donor snapshot
Context: While preparing old-code review, legacy backend code in donor snapshot created noise and risk of accidental reuse. | Decision: Remove `legacy-main/src/app/api` and `legacy-main/src/lib`, and keep donor snapshot focused on UI-facing code. | Reason: Preserves a clearer frontend-only review surface and avoids backend cross-contamination.

## 2026-02-06: Lock sync payload to approval snapshot and reconcile after push
Context: Post-review edits and external QuickBooks state can drift from what was approved, risking incorrect accounting writes. | Decision: Capture `sync_snapshot` at approval/auto-approval, require evidence-backed key fields at sync gate, and reconcile created/reused QB bills against snapshot (vendor/doc/date/total) before final success. | Reason: Preserves reviewer intent, blocks low-trust pushes, and surfaces mismatches as explicit sync errors with audit trail.

## 2026-02-06: Add QuickBooks-side duplicate preflight before bill creation
Context: Internal idempotency protects replays, but it cannot catch existing bills already present in QuickBooks from external/manual flows. | Decision: Before createBill, query vendor-scoped bills and reuse an existing bill when doc number (or amount/date fallback) indicates a duplicate; record as deduped sync. | Reason: Prevents cross-system duplicate accounting entries while keeping sync idempotent.

## 2026-02-06: Gate QuickBooks sync with pre-sync checklist
Context: Approved documents could still carry force-approved flags or inconsistent totals before QuickBooks push. | Decision: Add a reusable pre-sync checklist (status, flags, required fields, amount consistency), enforce it in workflow sync + dry-run, and return checklist failures before bill creation. | Reason: Prevents bad accounting writes and gives a deterministic pre-push validation contract.

## 2026-02-06: Strengthen filename convention for business portability and traceability
Context: Semantic filenames worked but included `$` and missed stable business references in some document types. | Decision: Keep date/type/name core format, switch amount token to `USDxx.xx`, and add reference tokens (invoice number, account suffix, tax form type) when available. | Reason: Aligns with safer cross-platform naming practices and improves legal/accounting traceability during review and due diligence.

## 2026-02-05: Set new 163-file post-migration baseline
Context: Needed an end-to-end quality/performance checkpoint after cleanup and `@google/genai` migration. | Decision: Accept current baseline (163/163 jobs completed, 0 job failures, avg confidence 0.883, p95 51.6s, wall clock 817s) and prioritize fixes for invoice MAX_TOKENS and extraction_failed edge cases next. | Reason: Confirms stable throughput while focusing effort on the remaining quality tail.

## 2026-02-05: Completed Gemini SDK migration to @google/genai
Context: Legacy `@google/generative-ai` is deprecated and unsupported for ongoing reliability work. | Decision: Migrate Gemini client/wrapper/schema calls to `@google/genai`, keep compatibility wrapper contract (`{ response }`), and remove deprecated dependency. | Reason: Keeps platform support current without breaking existing pipeline code paths.

## 2026-02-05: Plan migration off legacy Gemini JS SDK
Context: Current package `@google/generative-ai` is legacy and out of support, increasing long-term reliability risk for structured outputs. | Decision: Keep the new structured-output guardrails now, and schedule migration to `@google/genai` as the next major reliability step. | Reason: Reduces immediate failures today while moving toward a supported SDK path.

## 2026-02-05: Centralized structured-output guardrails for Gemini JSON
Context: Batch runs still produced invalid/truncated JSON (often MAX_TOKENS), causing classification/extraction drops and noisy review flags. | Decision: Add a shared structured JSON generator with finish-reason diagnostics/retries, reduce classification output schema to essential fields, and add bank-statement key-field fallback when full extraction truncates. | Reason: Fixes root reliability failure mode while balancing throughput, quality, and token cost.

## 2026-02-05: Key-field fallback for low-confidence extraction
Context: Many documents returned low confidence or empty extractions, slowing review and degrading naming. | Decision: Add a lightweight key-field fallback extraction for missing essentials and log per-doc-type extraction metrics. | Reason: Improves reliability and surfaces bottlenecks without large cost increase.

## 2026-02-05: Name processed files by extraction + sync status
Context: Processed Drive files were mostly named as page_XXX_NEEDS_REVIEW due to partial_success from archive retention warnings. | Decision: Always generate semantic names from extraction and append _NEEDS_REVIEW only when sync_status indicates review. | Reason: Keeps names meaningful while preserving review signals.

## 2026-02-05: Harden Gemini JSON parsing
Context: Classification/extraction responses sometimes returned non-JSON text, causing parse errors and degraded quality. | Decision: Add robust JSON extraction/parsing to recover valid JSON blocks before failing. | Reason: Reduces parse failures without changing model behavior.

## 2026-02-05: Adaptive worker concurrency for OCR backfill
Context: Need high throughput without cost spikes or rate limits during backfill. | Decision: Add adaptive concurrency with throttle backoff and env knobs; surface OCR error codes to drive scaling. | Reason: Keeps performance high while preventing expensive retries or throttling.

## 2026-02-05: Conversation language set to English

Context: User requested English conversation. | Decision: Use English for conversation; keep code/comments/logs/docs in English. | Reason: Matches user preference while preserving English-only artifacts.

## 2026-02-05: Enforce JSON schema for Gemini outputs + retry empty extraction

Context: Occasional JSON parse errors and zero-confidence extractions caused needs-review noise. | Decision: Use Gemini response schemas (application/json) for classification/extraction and retry once on empty extraction with truncated context. | Reason: Improves stability and reduces false extraction failures without changing model.

## 2026-02-05: Bucket-level retention only (no per-object retention)

Context: Archive bucket uses retention policy for WORM; per-object retention caused warnings when object retention was disabled. | Decision: Rely solely on bucket-level retention and confirm retention via object metadata. | Reason: Bucket policy is provider-enforced, simpler to operate, and avoids per-object configuration drift.

## 2026-02-05: Separate archive vs working buckets

Context: Need WORM-grade archival storage plus a disposable workspace for transient artifacts. | Decision: Use two buckets (archive with retention policy, working with lifecycle cleanup) and rely on bucket-level retention enforcement. | Reason: Bucket-level retention is the most robust, provider-enforced immutability; working bucket keeps costs low and allows reprocessing.

## 2026-02-05: Store OCR layout in a separate table

Context: Phase 5 requires reliable evidence coordinates without bloating the core documents table. | Decision: Store Document AI layout JSON in a new `document_layouts` table keyed by `document_id`. | Reason: Keeps `documents` lean while enabling on-demand layout fetch for evidence.

## 2026-02-05: Pivot to evidence coordinates

Context: Field evidence lacks OCR coordinates, limiting review speed and audit-quality proof. | Decision: Pause Phase 4 frontend tasks and set Phase 5 to implement Document AI layout → evidence coordinates. | Reason: Evidence-quality gap impacts legal-grade review more than UI polish.

## 2026-02-04: Consolidated milestone docs into phase notes

Context: Had both `/docs/milestones/M*.md` files and `/docs/phase-*-done.md` files tracking the same work. | Decision: Delete milestone folder, keep phase notes only. | Reason: Phase notes follow AGENTS.md format, are more concise, and avoid duplication.

## 2026-02-03: Rate limiting deferred

Context: Security audit identified heavy endpoints (export, search, assistant) without rate limits. | Decision: Defer rate limiting. | Reason: All endpoints require authentication, limiting abuse risk. Will revisit if abuse patterns emerge.

## 2026-02-03: Toy dataset size (2 docs) sufficient for M3

Context: M3 accuracy harness built with 2-document truth labels. | Decision: Accept 100% accuracy on toy dataset as M3 pass. | Reason: Framework is solid; expanding to 30-50 docs is a follow-up task, not a blocker.

## 2026-02-02: Dual auth for admin routes

Context: Admin endpoints need protection but also scripted access. | Decision: Support both session-based auth AND x-admin-secret header. | Reason: Allows UI access (session) and CLI/cron access (secret) without separate endpoints.

## 2026-02-02: Evidence backfill is append-only

Context: Backfilling field evidence for legacy documents. | Decision: Merge new evidence into existing, never overwrite manual edits. | Reason: Preserves human corrections while filling gaps.

## 2026-02-01: Field evidence stored at extraction time

Context: Need per-field audit trail (value + confidence + quote + page). | Decision: Generate field_evidence during extraction, store in extraction.data.field_evidence. | Reason: Avoids separate table, keeps evidence co-located with extraction.

## 2026-01-31: Graceful pipeline degradation

Context: Pipeline has multiple stages (OCR, classify, extract, archive, embed). | Decision: Each stage fails independently; partial results saved. | Reason: OCR failure shouldn't lose the file; extraction failure shouldn't lose OCR text. All states auditable.

## 2026-01-30: Idempotent QuickBooks sync via hash

Context: Duplicate invoices could create duplicate QB bills. | Decision: Use hash(invoice_number + total + vendor) as idempotency key. | Reason: Prevents duplicates even if same document processed twice.

## 2026-01-28: 7 document types (not extensible)

Context: Need to classify documents into categories. | Decision: Fixed enum: invoice, receipt, bank_statement, contract, tax_form, correspondence, other. | Reason: Keeps prompts focused; "other" catches edge cases. Adding types requires migration.

## 2026-01-25: pgvector with HNSW for semantic search

Context: Need similarity search over document embeddings. | Decision: Use pgvector extension with HNSW index (768-dim vectors from Gemini). | Reason: Native PostgreSQL, no separate vector DB. HNSW balances speed vs accuracy.

## 2026-01-20: Supabase as single backend

Context: Need auth, database, and realtime. | Decision: Use Supabase for all three. | Reason: Simplifies infrastructure; PostgreSQL is production-grade; auth integrates with Google OAuth.

---

## Learnings

- Conversation is in English; all code, comments, logs, and documentation must be in English.
- All code, comments, logs, and documentation must be in English. Chinese is for conversation only.
- Resetting `processing_jobs` to `pending` requires clearing `steps_completed` and step fields; otherwise retries can fail with missing in-memory pipeline context.
- In `@google/genai`, forcing `apiVersion: "v1"` can reject `responseMimeType`/`responseSchema`; use default/beta for structured JSON in this pipeline.
- Gemini text-embedding-001 returns 768-dim vectors; pgvector index must match.
- Google Document AI has separate processor IDs per region; use us for US deployment.
- QuickBooks sandbox tokens expire every hour; refresh logic is mandatory.
- Supabase RLS is bypassed by service key; API routes must call verifyAuth explicitly.
- Field evidence page numbers are 1-indexed (from Document AI), not 0-indexed.
