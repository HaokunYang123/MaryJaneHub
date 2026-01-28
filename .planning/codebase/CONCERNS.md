# Codebase Concerns

**Analysis Date:** 2026-01-27

## Tech Debt

**Excessive Console Logging in Production Code:**
- Issue: 312+ `console.log()` and `console.error()` statements throughout codebase may expose sensitive data (amounts, vendor names, file IDs, error messages) in production logs
- Files: `src/lib/ai/executor.ts`, `src/lib/ai/secretary.ts`, `src/lib/ai/orchestrator.ts`, `src/lib/ai/profile-manager.ts`, `src/app/api/voice/tts/route.ts`, and many others
- Impact: Financial data leakage, security audit risks, log storage costs. Logs contain user emails, amounts, dates, vendor names
- Fix approach: Implement environment-based logging (use logger library with levels). Suppress console output in production, or use structured logging with log level filtering

**Widespread Use of `any` Type Despite Strict TypeScript:**
- Issue: 10 files contain `@typescript-eslint/no-explicit-any` eslint-disable comments, indicating type safety bypasses
- Files: `src/lib/ai/executor.ts`, `src/lib/ai/secretary.ts`, `src/lib/ai/orchestrator.ts`, `src/lib/google-drive.ts`, `src/hooks/useDeepgram.ts`, and others
- Impact: Loss of type safety at critical integration points; harder to refactor; potential runtime errors
- Fix approach: Replace `any` with proper union types or generics. Start with AI executor and orchestrator (most critical)

**Missing Error Handling on Critical API Routes:**
- Issue: Many API routes lack comprehensive error handling and validation
- Files: `src/app/api/voice/tts/route.ts` (partial handler), `src/app/api/files/upload/route.ts` (minimal validation)
- Impact: Unhandled exceptions could crash handlers or leak error details to clients
- Fix approach: Add try-catch with specific error types, input validation using Zod schemas, consistent error response format

**Binary Data Stored in Supabase Metadata:**
- Issue: PDF buffers and base64 data URLs stored directly in `metadata` field of documents table
- Files: `src/lib/ai/secretary.ts` (line 461-474), `src/lib/ai/executor.ts` (line 565-566), `src/lib/ai/orchestrator.ts` (line 1173)
- Impact: Bloats database records, slow queries, potential data corruption on large PDFs. Design violates single responsibility
- Fix approach: Remove binary data from metadata. Store only file references (Drive IDs, buffer hashes). Fetch PDF from Drive when needed

**Inconsistent State Management Across AI Systems:**
- Issue: State is scattered across multiple files without clear ownership
- Files: `src/lib/ai/executor.ts` (mock data arrays that mutate), `src/lib/ai/profile-manager.ts`, `src/hooks/useVoiceMode.ts` (large state management)
- Impact: Race conditions during concurrent requests, difficult to debug state mutations, mock data can become out of sync
- Fix approach: Centralize state in Redux, Zustand, or server-side session store. Make mock data immutable

## Known Bugs

**Race Condition in Google Drive Folder Creation:**
- Symptoms: When uploading multiple files simultaneously to the same folder, duplicate folders may be created with the same name
- Files: `src/lib/google-drive.ts` (lines 34-61, folder cache and pending creations)
- Trigger: Concurrent POST requests to `/api/files/upload` targeting same folder
- Workaround: Implement strict sequential uploads, or verify cache key is truly preventing duplicates
- Root cause: Pending folder creation map uses string key but concurrent requests may still create race window

**Unprotected File Cleanup Operation:**
- Symptoms: `/api/files/cleanup` endpoint runs expensive Drive API queries without authentication check
- Files: `src/app/api/files/cleanup/route.ts`
- Trigger: Any unauthenticated user can call POST /api/files/cleanup
- Workaround: Currently middleware should protect it, but route has no explicit auth check
- Risk: Denial of service attack by spamming cleanup requests; orphans legitimate documents

**Transcript Correction Context Leakage:**
- Symptoms: Voice mode stores entire recent assistant responses in memory to correct transcripts
- Files: `src/hooks/useVoiceMode.ts` (lines 64-92, context correction logic)
- Trigger: Happens automatically after each voice interaction
- Impact: If user switches sessions, previous conversation context could bias transcript corrections
- Fix approach: Limit context to current session only, clear on logout

## Security Considerations

**Hardcoded Admin Email in Whitelist:**
- Risk: Developer email `t300025hao@gmail.com` marked as admin in production code
- Files: `src/lib/auth/whitelist.ts` (line 30)
- Current mitigation: Whitelist is version controlled; assumes private repo
- Recommendations: Move to environment variables, remove once development complete, implement role-based access control

**Service Account JSON in Environment Variables:**
- Risk: Full Google Service Account credentials stored in `.env.local` and passed through `process.env.GOOGLE_SERVICE_ACCOUNT_JSON`
- Files: `src/lib/google-drive.ts` (line 9), `src/app/api/files/cleanup/route.ts` (line 8)
- Current mitigation: Marked as `server-only`, not exposed to client
- Recommendations: Use Google Cloud workload identity instead, rotate service account regularly, audit Drive access logs

**QuickBooks Tokens Stored in HTTP-Only Cookies:**
- Risk: Access and refresh tokens for QuickBooks stored in cookies without CSRF protection
- Files: `src/lib/quickbooks.ts` (lines 56-68, cookie storage)
- Current mitigation: `httpOnly=true`, `sameSite=lax`, secure flag in production
- Recommendations: Add CSRF token validation on operations, implement token rotation on refresh, clear tokens on logout

**Missing Input Validation on AI Orchestrator Functions:**
- Risk: AI executor accepts any arguments without validation; could pass malicious commands
- Files: `src/lib/ai/executor.ts` (line 70, `Record<string, any>` args)
- Current mitigation: Functions are server-only, protected by whitelist
- Recommendations: Create Zod schemas for each function's arguments, validate at entry point

**Error Messages Exposing System Details:**
- Risk: Development mode error responses expose full error messages and stack traces
- Files: `src/app/api/assistant/route.ts` (lines 57-62, conditional debug error)
- Current mitigation: Only in development mode
- Recommendations: Even in dev, avoid exposing file paths or internal state; use error codes instead

**Voice Mode Stores Sensitive Context:**
- Risk: Voice mode maintains conversation history in client state, which could include financial amounts, names, dates
- Files: `src/hooks/useVoiceMode.ts`, `src/components/voice/VoiceModeOverlay.tsx`
- Current mitigation: In-memory state (lost on refresh)
- Recommendations: Implement data minimization - don't store financial amounts in voice history, encrypt session storage

## Performance Bottlenecks

**Tier-Based AI Analysis with No Caching:**
- Problem: Every uploaded file runs through Tier 1 and Tier 2 Gemini calls; no caching of similar file analysis
- Files: `src/lib/ai/secretary.ts` (lines 258-370, analyzeUploadedFile function)
- Cause: No memoization or vector similarity search
- Improvement path: Implement embedding-based caching; reuse analysis for visually similar documents (receipts, invoices)

**Inefficient Duplicate Detection with Linear Scan:**
- Problem: Duplicate detection scans ALL documents in database on each upload (O(n) complexity)
- Files: `src/lib/ai/secretary.ts` (lines 164-234, checkForDuplicates)
- Cause: Jaccard similarity comparison on every document
- Improvement path: Add database index on amount/date/vendor, limit scan to recent files, use fuzzy search PostgreSQL extension

**Synchronous PDF Buffer Conversion:**
- Problem: PDF base64 conversion happens synchronously in request handlers
- Files: `src/lib/ai/secretary.ts` (line 465), `src/lib/ai/executor.ts` (line 1653), `src/lib/ai/orchestrator.ts` (line 1129)
- Cause: Large PDFs block request thread during Buffer.from() operations
- Improvement path: Move to async buffer processing, implement streaming for large files

**Unoptimized Google Drive Folder Lookups:**
- Problem: Recursive folder path creation queries Drive API for each segment, even with caching
- Files: `src/lib/google-drive.ts` (lines 37-96, findOrCreatePath)
- Cause: Each folder segment requires a separate Drive API call
- Improvement path: Batch folder creation, implement deeper cache with expiration, use shared drive features

**No Pagination on Document Queries:**
- Problem: Files page fetches all pending documents at once; scales poorly with thousands of files
- Files: `src/app/files/page.tsx` (line 52, fetchPendingDocs)
- Cause: No limit/offset in Supabase queries
- Improvement path: Implement pagination (20 items per page), virtual scrolling for large lists

## Fragile Areas

**AI Orchestrator State Machine:**
- Files: `src/lib/ai/orchestrator.ts` (1375 lines)
- Why fragile: Massive function with multiple state paths (search, function execution, voice mode). Hard to trace execution flow. Conversation history is global state.
- Safe modification: Add state machine library (xstate) before making changes. Write tests for each conversation path first.
- Test coverage: No unit tests exist for orchestrator logic

**Google Drive Integration with Folder Caching:**
- Files: `src/lib/google-drive.ts` (258 lines)
- Why fragile: Dual cache mechanism (folderCache + pendingFolderCreations) can become inconsistent. Race conditions during concurrent uploads.
- Safe modification: Add integration tests for concurrent uploads. Implement cache invalidation strategy. Consider using Drive shortcuts instead of creating new folders.
- Test coverage: No tests for concurrent scenarios

**Voice Transcript Correction Logic:**
- Files: `src/hooks/useVoiceMode.ts` (562 lines)
- Why fragile: Complex phonetic matching and Levenshtein distance logic with arbitrary thresholds (distance <= 2). Easy to introduce regressions.
- Safe modification: Extract soundsLike() and extractKeyTerms() into testable utility functions. Document all thresholds with rationale.
- Test coverage: No unit tests; only live testing

**File Upload and Processing Pipeline:**
- Files: `src/app/api/files/upload/route.ts` → `src/lib/ai/secretary.ts` → `src/lib/google-drive.ts`
- Why fragile: Three-stage async pipeline with no transaction semantics. If Drive upload fails, database record is orphaned.
- Safe modification: Implement idempotency keys, add rollback logic for failed stages, or use saga pattern.
- Test coverage: No integration tests

## Scaling Limits

**Supabase Document Table Growth:**
- Current capacity: No indexes mentioned; likely <100k documents efficient
- Limit: Query performance degrades around 1M documents (duplicate detection becomes O(n) scan)
- Scaling path: Add database indexes on (amount, date, vendor_name, created_at); partition by year; implement archival for old documents

**AI Gemini API Rate Limits:**
- Current capacity: Tier 1 and Tier 2 analysis calls ~2 per file
- Limit: Google Gemini API has quota limits (default 60 RPM for some models)
- Scaling path: Implement request queue with exponential backoff; use cached embeddings instead of re-analyzing; batch similar files

**Google Drive Quota:**
- Current capacity: Assumed standard Drive storage (15GB free or higher tier)
- Limit: PDF storage + image uploads will hit quota with thousands of files
- Scaling path: Archive old files to Cloud Storage, implement file retention policy, clean up versions

**Concurrent Voice Sessions:**
- Current capacity: Deepgram and ElevenLabs API calls have per-minute limits
- Limit: Multiple simultaneous voice mode users will hit rate limits quickly
- Scaling path: Implement request queue, use regional endpoints, upgrade to higher tier plans, add local fallback TTS

## Dependencies at Risk

**Next.js 16.1.2 (Bleeding Edge):**
- Risk: Very recent major version; potential stability issues and missing ecosystem plugins
- Impact: Some middleware or auth patterns may not be stable; library compatibility issues
- Migration plan: Monitor Next.js release notes, have plan to pin to 16.0 LTS if issues arise

**LangChain 0.3.0 (Major Version Recently Released):**
- Risk: Early major version; breaking changes possible
- Impact: AI function calling or prompt chains may need rewrites
- Migration plan: Pin version, monitor changelog; consider switching to raw API if LangChain causes issues

**Intuit OAuth Library (intuit-oauth ^4.2.2):**
- Risk: Intuit packages tend to have slow update cadence; security issues may not be patched quickly
- Impact: QuickBooks auth could break if Intuit changes OAuth endpoints
- Migration plan: Keep `exchangeToken()` abstracted so auth logic can be rewritten if needed

**PDF Generation Stack (pdfkit, pdf-lib, pdf-parse):**
- Risk: Three different PDF libraries create maintenance burden and potential conflicts
- Impact: Unclear which library is used for generation vs. parsing; could have security issues in unused libs
- Migration plan: Consolidate to single PDF library; remove unused dependencies

## Missing Critical Features

**No Audit Logging:**
- Problem: Financial transactions (expenses, invoices, bills) have no audit trail. Can't track who made what changes when.
- Blocks: Regulatory compliance, fraud detection, user accountability
- Recommendation: Add audit_logs table, log all write operations with user ID and timestamp

**No Idempotency for API Calls:**
- Problem: Duplicate requests could create duplicate expenses or invoices
- Blocks: Reliable file uploads over unreliable networks (mobile), retrying failed operations safely
- Recommendation: Implement idempotency keys on POST endpoints; store request hashes

**No Rate Limiting on API Routes:**
- Problem: No protection against brute force or DoS attacks
- Blocks: Production deployment; API scalability
- Recommendation: Add rate limiting middleware (by IP, by user), implement request throttling

**No Transaction Support:**
- Problem: Multi-step operations (upload → analyze → save) have no rollback if intermediate step fails
- Blocks: Data consistency; reliable pipeline execution
- Recommendation: Use database transactions where possible, or implement saga pattern

## Test Coverage Gaps

**AI Orchestrator Has Zero Unit Tests:**
- What's not tested: Function calling, state management, conversation history, error handling paths
- Files: `src/lib/ai/orchestrator.ts` (1375 lines with complex logic)
- Risk: Regressions in AI responses, silent failures in function execution
- Priority: **High** - This is core to the application

**File Processing Pipeline Not Tested:**
- What's not tested: Upload → Analyze → Save → Drive Move sequence; failure scenarios; concurrent uploads
- Files: `src/app/api/files/upload/route.ts`, `src/lib/ai/secretary.ts`, `src/lib/google-drive.ts`
- Risk: Data loss, orphaned files, dropped documents
- Priority: **High** - Critical business operation

**Voice Mode Transcript Correction Untested:**
- What's not tested: Context extraction, soundsLike matching, edge cases (homophones, accents)
- Files: `src/hooks/useVoiceMode.ts` (lines 13-92)
- Risk: Users cannot be understood; commands misinterpreted
- Priority: **High** - User-facing feature

**Google Drive Integration No Concurrency Tests:**
- What's not tested: Concurrent folder creation, race conditions, cache consistency
- Files: `src/lib/google-drive.ts`
- Risk: Duplicate folders, orphaned files, API quota exceeded
- Priority: **Medium** - Affects large-scale uploads

**QuickBooks Sync Logic Not Tested:**
- What's not tested: Bill creation, invoice syncing, error recovery, token refresh
- Files: `src/lib/ai/secretary.ts` (sync functions), `src/lib/quickbooks.ts`
- Risk: Bills not created, data mismatch between Mary's system and QuickBooks
- Priority: **High** - Financial sync is critical

**API Error Handling Paths Not Tested:**
- What's not tested: 400/401/403/404/500 error conditions, validation errors, auth failures
- Files: All `src/app/api/**` routes (24 route files)
- Risk: Inconsistent error responses, leaked error details, poor user experience
- Priority: **Medium** - Affects API reliability

---

*Concerns audit: 2026-01-27*
