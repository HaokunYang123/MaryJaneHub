# Phase 7: Batch OCR + Backfill Performance

## Goal
Backfill documents with high quality while keeping OCR cost low via dedupe and adaptive throughput.

## Tasks
- [x] Adaptive worker concurrency with throttle backoff — scales down on OCR throttling/timeouts and scales up after stable batches; env-configurable.
- [x] Surface OCR error codes to worker — OCR error codes/messages captured for backoff signals.
- [x] Add per-step timing + bottleneck summary — capture p50/p95/avg for pipeline stages and job steps.
- [x] Fix Drive naming for partial success — use semantic names and append _NEEDS_REVIEW only for true review statuses.
- [x] Harden JSON parsing for Gemini responses — robustly extract JSON to avoid parse errors.
- [x] Improve extraction reliability — add targeted retry for low-confidence/invalid output, fallback prompt for key fields, and per-doc-type failure metrics.
- [x] Build structured-output reliability layer — centralized JSON generation with finish-reason-aware retries and bank-statement summary fallback.
- [x] Validate with live worker batch — run worker on current queue and capture timing/quality bottlenecks.
- [x] Migrate Gemini SDK to supported package — move from `@google/generative-ai` to `@google/genai` without regression in classifier/extractor quality.
- [x] Validate full 163-file benchmark after cleanup — rerun from empty state and record completion/quality/performance baseline.
- [x] Backfill runbook + priorities — define batch ordering, cost guardrails, and throttle windows.
- [x] Mitigate invoice/key-field MAX_TOKENS + extraction_failed tail — cap line items and tighten fallback prompts.
- [x] Add semantic search test cases — add invariants and error handling checks.
- [x] Add semantic search highlights + locations — include query snippets and optional coords in search API.
- [x] Refine business filename convention — remove special currency symbol and add reference tokens (invoice/account/form).
- [x] Create customer alignment note — add top 5 customer confirmation questions.
- [x] Add pre-sync checklist gate for QuickBooks — block sync when review flags/status/critical amount checks fail; expose checklist in dry-run.
- [x] Add QuickBooks duplicate preflight in sync workflow — detect likely existing bills in QuickBooks and dedupe before create.
- [x] Add sync snapshot lock — freeze approved/auto-approved invoice payload and use snapshot during sync.
- [x] Enforce strict evidence at sync gate — require vendor/date/total evidence before QuickBooks push.
- [x] Add post-sync reconciliation — compare created/reused QB bill against snapshot and fail on mismatches.
- [x] Prune legacy backend from donor snapshot — remove `legacy-main/src/app/api` and `legacy-main/src/lib` for UI-only review.
- [x] Remove remaining backend residue from donor snapshot — delete `legacy-main/supabase` and `legacy-main/test-drive.js`.
- [x] Merge effortless frontend slice from legacy UI — add styling baseline and reuse shell/dashboard components without legacy API coupling.
- [x] Stabilize merged frontend slice build — clear app/lib type blockers and verify Next.js webpack build succeeds.
- [x] Add backend foundation for Drive AI-management — ship corpus listing, metadata APIs, and managed-zone organize guard without frontend dependency.
- [x] Add duplicate-collapse in search results — return canonical search hits with duplicate count metadata for UI/chat.
- [x] Add duplicate-collapse regression test script — verify canonicalization and duplicate metadata behavior without external services.
- [x] Implement production documents workspace UI — replace `/documents` placeholder with real upload/recent/search/preview layout wired to current APIs only.
- [x] Verify documents workspace build — Next.js webpack build succeeds with new documents UI.
- [x] Add secure document preview endpoint — return auth-gated signed file preview URL for `/documents` UI.
- [x] Upgrade semantic search interaction UX — source cards in AI chat open right preview with query context and highlight focus.
- [x] Align semantic panel visual style with dashboard theme — keep interaction model but remove dark-theme mismatch.
- [x] Convert preview to anchored overlay drawer — preview slides from AI panel left edge, keeps chat width fixed, and dims document area backdrop.
- [x] Globalize AI rail across app shell — make AI panel persistent on every page and route source-click preview into `/documents` overlay.
- [x] Add unified assistant chat endpoint for global AI rail — route intent-aware chat in one API and return sources only when available.
- [x] Fix preview anchor alignment after global rail move — slide preview from rail edge without dim overlay and remove stale rail-width offset.
- [x] Polish preview-first document UX — make PDF dominant, simplify secondary cards, and replace single confidence number with trust profile.
- [x] Fix header/rail layering + simplify preview to file-first layout — keep top bar above AI rail and move non-preview metadata/actions into a dedicated info column.
- [x] UX validation for preview/chat stability — prevent stale preview races, preserve manual chat scroll position, and recover cleanly after assistant API errors.
- [x] Add PDF highlight overlays with pdf.js — render controlled PDF canvas with search and field-evidence highlight boxes plus fallback to iframe preview.
- [x] Fix PDF highlight overlap bug — include segment containment in layout matching so multi-segment matches still produce coordinates.
- [x] Widen preview panel + dynamic height baseline — increase overlay width and remove fixed pixel preview heights.
- [x] Add approve/reject review controls to preview panel — wire review actions to existing approve/reject APIs with inline reject reason flow.
- [x] Add temporary collaboration boundary for parallel banking development — document protected scope and AI-agent guardrails so banking work does not interrupt active file-system track.
- [x] Fix AI rail vertical fill to bottom of viewport — use viewport-locked app shell height so chat panel no longer collapses to content height.
- [x] Harden AI rail bottom anchoring across browsers — switch rail interior to explicit 3-row grid so message area fills middle and input stays pinned at bottom.
- [x] Redesign AI rail structure to workspace-style sidebar — top utility bar, long conversation surface, and pinned bottom composer while keeping MaryJane visual language.
- [x] Remove shell footer from workspace layout — allow AI rail to reach viewport bottom with no extra bottom strip.

## Progress
Adaptive worker concurrency with throttle backoff: Done — adaptive scaling + env knobs added.
Surface OCR error codes to worker: Done — OCR error codes plumbed to worker.
Add per-step timing + bottleneck summary: Done — worker prints timing summary at end of batch.
Fix Drive naming for partial success: Done — semantic naming now uses sync_status to decide _NEEDS_REVIEW suffix.
Harden JSON parsing for Gemini responses: Done — parsing now extracts JSON blocks and retries parsing.
Improve extraction reliability: Done — key-field fallback + per-type extraction metrics added.
Build structured-output reliability layer: Done — shared structured JSON helper now handles truncation/non-JSON failures and bank statements fall back to key fields when full extraction overflows.
Validate with live worker batch: Done — processed 43 queued jobs with 0 hard failures; extraction remains top bottleneck (invoice MAX_TOKENS on some files).
Migrate Gemini SDK to supported package: Done — all Gemini wrapper/extractor paths now use `@google/genai`; classifier/extractor suites still pass.
Validate full 163-file benchmark after cleanup: Done — 163/163 jobs completed, 0 job failures, avg confidence 88.3%, p95 job duration 51.6s, wall-clock 817.4s.
Backfill runbook + priorities: Done — runbook drafted in `/docs/ops/backfill-runbook.md` (FIFO by `created_at`, default 24/7 window, adaptive guardrails).
Mitigate invoice/key-field MAX_TOKENS + extraction_failed tail: Done — capped invoice line items, added stricter prompt constraints, lowered key-field token budgets.
Add semantic search test cases: Done — expanded `scripts/test-semantic-search.ts` with invariants, score bounds, ordering, score formula, keyword boost, and error handling.
Add semantic search highlights + locations: Done — added highlight/coords builder and `includeHighlight`/`includeLocation` flags in `/api/documents/search`.
Refine business filename convention: Done — amounts now use `USD` token and filenames include stable reference tokens (invoice number/account suffix/form type) when available.
Create customer alignment note: Done — drafted `/docs/ops/customer-alignment-note.md` with five priority customer questions.
Add pre-sync checklist gate for QuickBooks: Done — added reusable checklist validation, integrated into sync workflow + dry-run API, and enforced route-level auth for `/api/documents/sync`.
Add QuickBooks duplicate preflight in sync workflow: Done — vendor-scoped bill query + safe match rules (docNumber or amount/date fallback) now reuse existing QB bill and skip create.
Add sync snapshot lock: Done — approval/auto-approval now captures `sync_snapshot`, and sync/dry-run consume snapshot to prevent post-approval field drift.
Enforce strict evidence at sync gate: Done — checklist evidence checks are now blocking errors (not warnings) for actual sync and dry-run validation.
Add post-sync reconciliation: Done — sync now fetches created/reused QB bill and validates vendor/doc/date/total against snapshot; mismatches are stored as `sync_status=error` with audit log details.
Prune legacy backend from donor snapshot: Done — deleted `legacy-main/src/app/api` and `legacy-main/src/lib` to keep only UI-facing donor code.
Remove remaining backend residue from donor snapshot: Done — deleted `legacy-main/supabase` and `legacy-main/test-drive.js`.
Merge effortless frontend slice from legacy UI: Done — added Tailwind baseline (`app/globals.css` + `postcss.config.mjs`), created reusable shell components, and migrated `/dashboard` to current session + document summary data without legacy endpoints.
Build verification for frontend merge: Done — resolved app/lib TypeScript blockers and verified `npm run build -- --webpack` passes.
Stabilize merged frontend slice build: Done — scoped Next.js type-check to app/lib (excluded `scripts/**/*` from `tsconfig.json`) to avoid unrelated script failures during frontend merge iteration.
Add backend foundation for Drive AI-management: Done — added `/api/admin/drive/corpus`, `/api/admin/drive/metadata`, `/api/admin/drive/organize` with shared-drive-safe Drive calls and managed-root write guard support.
Add duplicate-collapse in search results: Done — added canonical duplicate grouping logic and applied it to `/api/documents/search` and `smartSearch` output.
Add duplicate-collapse regression test script: Done — added `scripts/test-search-deduplicate.ts` and `npm run test:search:dedupe` (5/5 pass).
Drive live validation sequencing: Done — confirmed frontend-first priority; deferred live Drive validation until regular Drive environment is provisioned.
Drive access scope for pilot: Done — agreed to folder-scoped access (Mary test parent folder with Inbox/Processed) and deferred full-drive scope.
Pilot Drive connectivity check: Done — `npm run test:drive` confirmed configured Inbox/Processed access (Inbox currently empty).
Implement production documents workspace UI: Done — `/documents` now uses `AppShell` + new client workspace with upload staging area, recent files, semantic AI panel, and collapsible right-side preview/chat using `/api/documents`, `/api/documents/search`, and `/api/documents/[id]`.
Verify documents workspace build: Done — `npm run build -- --webpack` passes after documents workspace integration.
Add secure document preview endpoint: Done — added `/api/documents/[id]/preview` with auth + signed GCS URL fallback to Drive preview URL.
Upgrade semantic search interaction UX: Done — redesigned AI panel with source cards, added smoother chat interactions, and wired source clicks to open exact-file preview with focus context (token/quote/page/facts).
Align semantic panel visual style with dashboard theme: Done — restyled semantic panel/bubbles/sources/inputs to white-slate-green dashboard system while preserving motion and source-to-preview flow.
Convert preview to anchored overlay drawer: Done — preview no longer consumes flex layout width; it now slides from the AI panel left edge over recent files with dim backdrop and preserves AI panel width.
Globalize AI rail across app shell: Done — moved AI rail to `AppShell`, removed local `/documents` chat rail, and wired cross-page source clicks to open `/documents` preview with context via shared provider.
Add unified assistant chat endpoint for global AI rail: Done — added `/api/assistant/chat` (auth + intent routing via assistant core), wired `AiRail` to post conversation context there, and kept source cards conditional with clickable preview linkage.
Fix preview anchor alignment after global rail move: Done — removed stale `railWidth` offset and dim backdrop from `/documents` preview drawer so it anchors cleanly from the AI rail edge.
Polish preview-first document UX: Done — rebalanced preview layout around full-height PDF, moved details/review into cleaner collapsible sections, and added a multi-signal confidence profile (extraction/evidence/context -> trust level).
Fix header/rail layering + simplify preview to file-first layout: Done — app shell now clips below header with consistent max-width, header stays above rail on scroll, and preview drawer now prioritizes full-height file rendering with separate right info/actions column.
UX validation for preview/chat stability: Done — added preview fetch cancellation, bottom-threshold auto-scroll behavior, and context reset on assistant errors.
Add PDF highlight overlays with pdf.js: Done — added controlled PDF rendering with highlight overlays (search + field evidence) and iframe fallback when viewer load fails.
Fix PDF highlight overlap bug: Done — added containment case to layout matching logic so highlights spanning multiple OCR segments are retained.
Widen preview panel + dynamic height baseline: Done — replaced narrow/fixed-height preview layout with wider overlay and fluid full-height viewer region.
Add approve/reject review controls to preview panel: Done — added UI actions for reviewable statuses with reject reason capture and status refresh after mutation.
Add temporary collaboration boundary for parallel banking development: Done — added `/docs/ops/collaboration-boundary.md`, linked it in AGENTS, and marked removal after full-track integration.
Fix AI rail vertical fill to bottom of viewport: Done — changed `AppShell` root to `h-dvh` with outer overflow hidden so rail/main region has a definite height and stretches correctly.
Harden AI rail bottom anchoring across browsers: Done — rail now uses `grid-rows-[auto,minmax(0,1fr),auto]` for deterministic header/messages/input layout in Safari/Chrome/Firefox.
Redesign AI rail structure to workspace-style sidebar: Done — added compact top controls (new chat/collapse), cleaner bubble/source hierarchy, and boxed bottom composer with utility row in consistent light theme styling.
Remove shell footer from workspace layout: Done — removed `FooterBar` from `AppShell` so right rail spans fully from header to viewport bottom on workspace pages.

- [x] Add business conversation intent to AI copilot — new `biz` intent routes broad business questions through metadata aggregation + Gemini for conversational answers.
- [x] Evolve AI copilot from document search tool to conversational business AI — renamed `biz` to `chat` as default intent, added greeting/casual detection, conversation history in Gemini prompt, and fixed source card display for non-search intents.

## Progress
Add business conversation intent to AI copilot: Done — added `biz` intent with metadata aggregation, Gemini synthesis, and deterministic fallback; wired through router, rules, clarify, and frontend suggested prompts.
Evolve AI copilot to conversational business AI: Done — renamed `biz` → `chat` as general-purpose default intent; added greeting/casual rule matching; conversation history passed to Gemini; fallback changed from `search` to `chat`; source cards suppressed for clarification/error/chat responses.

- [x] Fix broken search routing + unblock document intelligence — fix follow-up clarification loop, add natural language search rules, vendor extraction, and async model fallback so search/RAG queries reach the right handlers.

## Progress
Fix broken search routing + unblock document intelligence: Done — exported CONFIDENCE_THRESHOLD/getConfidenceLevel from router; fixed handleFollowUp to recalculate needsClarification from boosted score; switched handleAssistantQuery to async routeQuery for Gemini model fallback; added search_natural rule with analytics guard; added vendor extraction (from/by/for + stopword guard) to parseQuery; enhanced classifyWithModel prompt; 81/81 tests pass.

- [x] Fix source card filtering, sum vendor matching, markdown rendering, and follow-up context — use filtered search results for source cards, case-insensitive vendor extraction in sum-handler, install react-markdown for chat bubbles, and add elliptical follow-up intent carry-over.

## Progress
Fix source card filtering, sum vendor matching, markdown rendering, and follow-up context: Done — source cards now derive from filtered `executeSearch()` results (not unfiltered `hybridSearchDocuments`); sum-handler `extractVendorFromSemanticText` is case-insensitive with `about`/`related to` patterns; assistant messages render markdown via `react-markdown`+`remark-gfm`; Gemini prompt uses dash-bullets; elliptical queries ("the correct one?") carry over previous intent/slots; 104/104 tests pass.

## Next
TBD — evaluate next priority (cross-browser QA pass for preview drawer, assistant UX polish, or Drive live validation).
