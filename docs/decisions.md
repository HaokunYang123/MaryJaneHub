# Technical Decisions

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
- Gemini text-embedding-001 returns 768-dim vectors; pgvector index must match.
- Google Document AI has separate processor IDs per region; use us for US deployment.
- QuickBooks sandbox tokens expire every hour; refresh logic is mandatory.
- Supabase RLS is bypassed by service key; API routes must call verifyAuth explicitly.
- Field evidence page numbers are 1-indexed (from Document AI), not 0-indexed.
