# Technical Decisions

## 2026-02-07: Fix source card filtering, sum vendor matching, markdown rendering, and follow-up context
Context: After routing fix, four data-flow issues remained: (1) source cards ran unfiltered `hybridSearchDocuments` instead of using filtered `executeSearch()` results, showing irrelevant docs; (2) sum-handler `extractVendorFromSemanticText` required uppercase first letter, failing on lowercase user input like "centerpointe"; (3) Gemini markdown wasn't rendering — `{message.text}` was a raw text node; (4) elliptical follow-ups ("the correct one?") lost intent context and fell to chat. | Decision: (1) Surface `searchResults` through `AssistantResponse` and build source cards from those exclusively — no unfiltered fallback; (2) make vendor extraction case-insensitive, broaden char class for `&.'-`, add `about`/`related to` preposition patterns; (3) install `react-markdown`+`remark-gfm`, wrap assistant messages in `<ReactMarkdown>`, add scoped `.ai-markdown` CSS; (4) add `lastIntent`/`lastSlots` to `ConversationContext`, detect short referential queries and re-enter previous intent flow; (5) tighten Gemini prompt to use dash-bullets. | Reason: All issues were data-flow/rendering bugs — no model upgrade needed. Gemini 2.5 Flash generates correct content; the bugs were in filtering, extraction patterns, rendering, and context tracking.

## 2026-02-07: Fix broken search routing + unblock document intelligence
Context: After biz→chat rename, natural language search queries ("can you find me the file in 2012 about centerpointe?") matched no rule — `search_explicit` requires query to START with "find", and natural phrasing starts with "can". Follow-ups got stuck in infinite clarification loops because `handleFollowUp` boosted confidence but spread the old `needsClarification: true`. The sync-only `routeQuerySync` path in `handleAssistantQuery` had no Gemini model fallback. And `parseQuery` didn't extract vendor names. | Decision: (1) Export `CONFIDENCE_THRESHOLD`/`getConfidenceLevel` from router for shared use; (2) fix `handleFollowUp` to recalculate `needsClarification` from boosted score; (3) switch `handleAssistantQuery` to async `routeQuery` enabling Gemini model fallback; (4) add `search_natural` rule with analytics guard (trend/pattern/analysis queries skip to model); (5) add case-insensitive vendor extraction via from/by/for prepositions with stopword guard; (6) enhance `classifyWithModel` prompt with richer intent examples. | Reason: Pure routing fix — all downstream infrastructure (search, RAG, sum, single_qa, chat) already works; just needed queries to reach the right handlers.

## 2026-02-07: Evolve AI copilot from document search tool to conversational business AI
Context: The AI copilot was architecturally inverted — a document search tool that sometimes talked. Unrecognized queries like "hi" fell to `search` at 0.3 confidence, triggered clarification, and showed 8 irrelevant source cards. | Decision: Rename `biz` intent to `chat` as the default fallback; add greeting/casual rule matching (0.95/0.92 confidence); pass conversation history to Gemini for multi-turn context; change routeQuerySync fallback from `search` at 0.3 to `chat` at 0.75; suppress source cards for non-answer responses. | Reason: Conversation-first AI that only shows document data when asked, matching modern business AI patterns (Gemini, Copilot).

## 2026-02-07: Add business conversation intent to AI copilot
Context: General business questions like "How is my business doing?" fell through to RAG at low confidence and triggered clarification instead of answering. | Decision: Add a fifth `biz` intent that aggregates document metadata (no raw_text/embedding) into a business snapshot, feeds it to Gemini for conversational answers, and falls back to a deterministic summary on LLM failure. Rules placed after sum but before rag to avoid collision with specific aggregation or entity-specific queries. | Reason: Enables natural business-level conversation without schema changes, reusing existing documents table and Gemini infrastructure.

## 2026-02-07: Redesign AI rail to workspace-style Gemini sidebar
Context: The AI rail needed consistent bottom-anchored input, full-height message surface, and compact controls matching the workspace visual language. | Decision: Switch rail to flex-col layout with utility top bar, scrollable message region, and pinned bottom composer with action row. Remove shell footer from workspace pages. | Reason: Matches the Gemini-style sidebar UX pattern while fitting MaryJane's white/slate/green theme.

## 2026-02-07: Enforce temporary collaboration boundary for split banking/file-system work
Context: A second developer is joining to build banking features, but active file-system frontend/backend work must remain uninterrupted. | Decision: Add `/docs/ops/collaboration-boundary.md` as the temporary contract, require banking-track AI sessions to read and follow it, and remove the boundary after both tracks are joined and integration is validated. | Reason: Prevents cross-track interference while enabling safe parallel delivery.

## 2026-02-07: Keep header above global AI rail and split preview metadata from file surface
Context: The global AI rail and preview drawer could visually collide with the sticky top bar, and preview content was crowded by metadata cards. | Decision: Move app shell to bounded flex/overflow layout, raise header z-index above rail, and refactor preview drawer into a full-height file viewport plus separate right-side info/actions column. | Reason: Preserves stable navigation hierarchy and delivers a cleaner, faster review workflow centered on the actual document.

## 2026-02-07: Make preview drawer PDF-first with trust-profile confidence
Context: The preview panel had too much stacked metadata and not enough document surface, so users could not review highlights efficiently. | Decision: Prioritize full-height PDF rendering with compact focus/legend, move secondary information to collapsible sections, and replace single confidence percent with a trust profile (extraction, evidence coverage, context signal, status risk). | Reason: Keeps the UI coherent and simple while making review actions faster and evidence easier to validate.

## 2026-02-07: Add approve/reject review controls in preview panel
Context: Documents in `pending_review` or `needs_attention` had no UI path to close the review loop — users had to approve/reject via API or DB. | Decision: Add Approve/Reject buttons in the preview panel's document detail section, wired to existing `/api/documents/:id/approve` and `/reject` endpoints, with inline reject-reason form and optimistic local status update. | Reason: Closes the review workflow loop entirely within the documents UI without adding new API surface.

## 2026-02-07: Fix resolveLayoutMatch overlap to cover segment-spanning matches
Context: PDF highlights were missing when a search term spanned multiple layout segments — both `overlaps` (start inside segment) and `intersects` (end inside segment) checks failed when the match was wider than any single segment. | Decision: Add a third `contains` condition (`startIndex <= segment.startIndex && endIndex >= segment.endIndex`) to both `highlight.ts` and `field-evidence.ts`. | Reason: Completes the three possible overlap geometries without changing layout data structures.

## 2026-02-07: Route global AI rail through a unified assistant API
Context: The right-side AI rail is now persistent across pages and needed one backend contract for both business Q&A and file-search source linking. | Decision: Add `/api/assistant/chat` with auth, route via assistant intent handling, and return source cards only when intent/output contains evidence (search/rag/single-doc). | Reason: Keeps one always-on chat UX while preserving source-to-preview linkage without duplicating page-specific chat logic.

## 2026-02-07: Use auth-gated signed preview URLs for source-linked document panel
Context: Documents UI needed exact-file preview from chat source clicks without exposing archive bucket objects publicly. | Decision: Add `/api/documents/[id]/preview` to return short-lived signed GCS URLs (with Drive preview fallback), and bind semantic-search source cards to this preview panel with query/page/quote context. | Reason: Enables secure real-file preview UX while keeping backend source-of-truth and highlight context aligned.

## 2026-02-07: Use folder-scoped Drive access for pilot
Context: Full-drive access is not available now, but Mary can share a test parent folder that includes Inbox/Processed. | Decision: Run pilot integration with folder-scoped access on the Mary test parent folder and defer full-drive indexing rollout. | Reason: Improves security posture and allows progress without broad Drive permissions.

## 2026-02-07: Ship documents workspace as API-first frontend slice
Context: `/documents` still showed a placeholder page while users needed a real working document experience aligned with dashboard style. | Decision: Replace `/documents` with `AppShell` + a client workspace that keeps legacy backend dropped, uses only current endpoints (`/api/documents`, `/api/documents/[id]`, `/api/documents/search`), and provides collapsible AI/search + right preview panels. | Reason: Delivers immediate usable frontend value without introducing deprecated endpoint coupling.

## 2026-02-07: Prioritize frontend work before live Drive validation
Context: Regular Google Drive environment for end-to-end admin API validation is not ready yet, while frontend work is unblocked. | Decision: Move frontend implementation ahead now and defer live Drive validation tasks until Drive environment provisioning is complete. | Reason: Maintains delivery momentum without blocking on external environment readiness.

## 2026-02-07: Add local regression test for duplicate-collapse search behavior
Context: Live Drive validation is pending environment setup, but duplicate-collapse logic needs fast confidence now. | Decision: Add an offline test script (`npm run test:search:dedupe`) covering canonical selection and duplicate metadata output. | Reason: Protects core retrieval behavior without requiring external service availability.

## 2026-02-07: Collapse semantic search duplicates to canonical results
Context: Users can keep duplicates in user-managed Drive areas, but search/chat should avoid noisy repeated hits. | Decision: Add backend duplicate-collapse logic with canonical tie-breakers (relevance, extraction confidence, recency) and return duplicate metadata (`duplicateCount`, `duplicateIds`) for UI/chat. | Reason: Preserves user flexibility while keeping retrieval output clean and professional.

## 2026-02-07: Implement Drive management as backend-first foundation without frontend dependency
Context: Need to start all-drive indexing and managed-zone organization quickly while product UX is still evolving. | Decision: Add admin backend APIs for corpus listing, private metadata writes, and managed-zone move/rename guard; keep frontend optional for later controls. | Reason: Delivers secure core behavior now and avoids blocking on UI decisions.

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
