# External Integrations

**Analysis Date:** 2026-01-27

## APIs & External Services

**AI & Language Models:**
- Google Gemini API - Document analysis and extraction
  - SDK/Client: @google/generative-ai 0.24.1
  - Auth: `GEMINI_API_KEY` environment variable
  - Multiple model tiers:
    - Tier 1: gemini-2.0-flash-lite (fast classification for 5,000+ files)
    - Tier 2: gemini-2.5-flash (deep extraction, financial data)
    - Tier 3: gemini-2.5-pro (expert analysis for low-confidence documents)
  - Usage: Invoice extraction, document classification, financial data extraction
  - Implementation: `src/lib/gemini.ts` exports classifierModel, deepExtractionModel, expertAnalysisModel
  - Integrated with: `src/lib/invoice-extractor.ts`, `src/app/api/sync/drive/route.ts`

**Text-to-Speech (TTS):**
- ElevenLabs API - Voice synthesis for voice mode
  - SDK/Client: Direct HTTP API calls via fetch
  - Auth: `ELEVENLABS_API_KEY` environment variable
  - Voice ID: `ELEVENLABS_VOICE_ID` (default: EXAVITQu4vr4xnSDxMaL - Sarah)
  - Endpoint: `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream`
  - Model: eleven_turbo_v2_5 for optimized latency
  - Implementation: `src/app/api/voice/tts/route.ts`
  - Client hook: `src/hooks/useElevenLabsTTS.ts`
  - Features: Streaming audio, text formatting (currency, numbers, symbols to words)

**Speech-to-Text (STT):**
- Web Speech API - Browser-native speech recognition (no external API)
  - Implementation: `src/hooks/useDeepgram.ts`
  - Fallback: No external service, uses native browser capability
  - Uses navigator.mediaDevices for microphone access
  - Auto-submit after 2 seconds of silence
  - Supported: English (en-US)

## Data Storage

**Databases:**
- PostgreSQL (via Supabase)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - Client: @supabase/supabase-js 2.90.1
  - Server client: @supabase/ssr 0.8.0
  - Tables: documents (with drive_id, content, metadata, category, status)
  - Usage: Document storage, indexing, search, user data
  - Initialization:
    - Browser: `src/lib/supabase/client.ts` - createBrowserClient()
    - Server: `src/lib/supabase/server.ts` - createServerClient()
    - Service role: `src/lib/supabase.ts` - createClient() with service role key
  - Row-level security (RLS) configured for authentication

**File Storage:**
- Google Drive - Primary file storage
  - Connection: Service account JSON via `GOOGLE_SERVICE_ACCOUNT_JSON` env var
  - Client: googleapis 170.0.0
  - Drive V3 API
  - Shared Drive ID: `GOOGLE_SHARED_DRIVE_ID`
  - Features: File upload, sync, move, status tracking
  - Implementation: `src/lib/google-drive.ts`
  - Usage in routes:
    - `src/app/api/sync/drive/route.ts` - Sync files from Drive to Supabase
    - `src/app/api/files/upload/route.ts` - Upload processed files
    - `src/app/api/invoices/extract/route.ts` - Extract and upload
    - `src/app/api/files/dismiss/route.ts` - File management
    - `src/app/api/files/cleanup/route.ts` - Cleanup operations

**Caching:**
- None detected - All state is either database or in-memory in Next.js

## Authentication & Identity

**Auth Provider:**
- Custom implementation with NextAuth 4.24.13
  - Location: `src/lib/auth/`
  - Email whitelist: `src/lib/auth/whitelist.ts`
  - Session management via NEXTAUTH_SECRET and NEXTAUTH_URL
  - Middleware: `src/middleware.ts`

**QuickBooks OAuth:**
- Intuit OAuth integration for accounting system access
  - SDK/Client: intuit-oauth 4.2.2
  - Client ID: `QUICKBOOKS_CLIENT_ID`
  - Client Secret: `QUICKBOOKS_CLIENT_SECRET`
  - Environment: `QUICKBOOKS_ENVIRONMENT` (sandbox or production)
  - Redirect URI: `QUICKBOOKS_REDIRECT_URI` (http://localhost:3000/api/auth/quickbooks for dev)
  - OAuth Flow:
    - Auth URL generation: `src/lib/quickbooks.ts` getAuthUrl()
    - Token exchange: exchangeToken() via `/api/auth/quickbooks/callback`
    - Token storage: Secure HTTP-only cookies with automatic refresh
    - Scopes: Accounting + OpenID
  - Token management:
    - Access token TTL: ~1 hour (auto-refresh 60s before expiry)
    - Refresh token TTL: 100 days
    - Cookies: qb_access_token, qb_refresh_token, qb_realm_id, qb_access_expires_at, qb_refresh_expires_at
  - API Endpoints:
    - Sandbox: https://sandbox-quickbooks.api.intuit.com
    - Production: https://quickbooks.api.intuit.com

## Monitoring & Observability

**Error Tracking:**
- None detected - Errors logged to console

**Logs:**
- Console logging with prefixes ([TTS], [STT], etc.) for debugging
- No external log aggregation service detected

## CI/CD & Deployment

**Hosting:**
- Not specified in codebase - Compatible with: Vercel (optimal for Next.js), AWS Lambda, Docker, Node.js hosting

**CI Pipeline:**
- None detected - No GitHub Actions or CI config found

## Environment Configuration

**Required env vars (Critical):**
- `NEXT_PUBLIC_SUPABASE_URL` - Database URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key
- `GEMINI_API_KEY` - Google Gemini API key
- `QUICKBOOKS_CLIENT_ID` - OAuth credentials
- `QUICKBOOKS_CLIENT_SECRET` - OAuth credentials
- `NEXTAUTH_SECRET` - Auth encryption key

**Optional env vars:**
- `ELEVENLABS_API_KEY` - For TTS (if not set, voice mode gracefully degrades)
- `ELEVENLABS_VOICE_ID` - Defaults to Sarah (EXAVITQu4vr4xnSDxMaL)
- `TIER1_MODEL` - Defaults to gemini-2.0-flash-lite
- `TIER2_MODEL` - Defaults to gemini-2.5-flash
- `TIER3_MODEL` - Defaults to gemini-2.5-pro
- `GOOGLE_SERVICE_ACCOUNT_JSON` - For Drive operations
- `GOOGLE_SHARED_DRIVE_ID` - Drive folder ID

**Secrets location:**
- `.env.local` file (development only - NOT committed to git)
- Environment variables in hosting platform (production)

## Webhooks & Callbacks

**Incoming:**
- `/api/auth/quickbooks` - QuickBooks OAuth callback
- `/api/auth/logout` - Logout endpoint

**Outgoing:**
- QuickBooks API calls via makeRequest() in `src/lib/quickbooks.ts`:
  - Vendor queries and creation
  - Bill creation
  - Account management
  - Journal entry creation
  - Profit & Loss reports
  - Expense summaries

**Google Drive Integration:**
- Drive file sync: POST `/api/sync/drive` - Manual trigger to sync files
- Drive file operations: GET/POST endpoints in `src/app/api/files/`
  - Upload, dismiss, cleanup, pending file status

## API Rate Limits & Quotas

**Google Gemini:**
- Tier-based approach to manage costs and speed:
  - Tier 1 (Flash-lite): Fast classification, cheaper
  - Tier 2 (Flash): Deep extraction for invoices/bills
  - Tier 3 (Pro): Expert analysis fallback

**QuickBooks:**
- OAuth token refresh: Automatic before expiration
- Query limits: MAXRESULTS 1000 for list operations

**ElevenLabs:**
- Quota tracking in frontend (`elevenLabsAvailable` flag)
- Graceful degradation: Falls back to browser voice if quota exceeded
- Detects 401, 403, and quota_exceeded errors

**Google Drive:**
- Pagination support with 100 files per page
- Supports all drives (supportsAllDrives: true)

---

*Integration audit: 2026-01-27*
