# Architecture

**Analysis Date:** 2026-01-27

## Pattern Overview

**Overall:** Next.js 16 full-stack application with AI-powered assistant, implementing a multi-layered architecture with clear separation between UI, API, business logic, and external integrations.

**Key Characteristics:**
- Agent-based AI orchestrator using Gemini 2.5 Flash with function calling
- Server-side session management and authentication via Supabase
- Stateless API routes for voice, documents, QuickBooks, and financial operations
- React Client Components for interactive UI with real-time state management
- Mock data layer for realistic development without live API connections

## Layers

**Presentation Layer:**
- Purpose: Render UI components, handle user interactions, manage local UI state
- Location: `src/components/`, `src/app/*/page.tsx`
- Contains: React components, page layouts, dashboard cards, forms
- Depends on: Hooks (`src/hooks/`), utilities (`src/lib/utils.ts`), types (`src/types/`)
- Used by: Next.js routing system

**API Layer:**
- Purpose: Handle HTTP requests, route to business logic, return JSON responses
- Location: `src/app/api/*/route.ts`
- Contains: Route handlers for assistant, voice I/O, document management, QuickBooks, invoices
- Depends on: AI orchestrator, Supabase client, external service clients (Google Drive, QuickBooks)
- Used by: Frontend via fetch(), voice components, external webhooks

**AI Orchestration Layer:**
- Purpose: Process natural language input, route to functions, manage conversation state
- Location: `src/lib/ai/` (orchestrator.ts, executor.ts, functions.ts, profile-manager.ts)
- Contains: AI prompt engineering, function definitions, execution logic, personal profile management
- Depends on: Gemini API client, Supabase, QuickBooks, Google Drive, document generators
- Used by: `/api/assistant` route handler

**Business Logic Layer:**
- Purpose: Implement core financial operations, integrations, document handling
- Location: `src/lib/` (quickbooks.ts, supabase.ts, google-drive.ts, sync-engine.ts, invoice-generator.ts, document-generator.ts)
- Contains: Integration clients, data transformation, PDF generation, file operations
- Depends on: External APIs (Gemini, Supabase, QuickBooks, Google Drive, ElevenLabs)
- Used by: AI executor, API routes

**Authentication & Security Layer:**
- Purpose: Protect routes, verify users, manage sessions
- Location: `src/middleware.ts`, `src/lib/auth/`, `src/lib/supabase/`
- Contains: Session refresh logic, email whitelist, auth callbacks, Supabase clients
- Depends on: Supabase Auth, environment variables
- Used by: All protected routes, AppWrapper component

**Data Persistence Layer:**
- Purpose: Store documents, expenses, preferences, conversation history
- Location: `src/lib/supabase/`
- Contains: Supabase database schema references (documents, expenses tables)
- Depends on: Supabase database
- Used by: AI executor, API routes, document search

## Data Flow

**Voice Interaction Flow:**

1. User speaks → ElevenLabs Scribe STT captures audio via WebSocket
2. STT outputs transcript → `useVoiceMode` hook in `src/hooks/useVoiceMode.ts`
3. Transcript sent → `/api/assistant` POST request
4. API handler calls `aiOrchestrator.processInput()`
5. Orchestrator sends to Gemini 2.5 Flash with function calling
6. Gemini returns function call or text response
7. If function call → executor invokes via `executeFunction()` in `src/lib/ai/executor.ts`
8. Function result returned to orchestrator
9. Orchestrator generates natural language response
10. Response sent back via API → `useElevenLabsTTS` converts to speech via ElevenLabs TTS API
11. Audio played in browser via audio element

**Financial Data Flow:**

1. User action (e.g., "record $500 expense") → `/api/assistant`
2. AI Orchestrator processes, calls `record_expense` function
3. Executor calls `quickbooks.createBill()` if QB authenticated
4. Simultaneously saves to Supabase `expenses` table (fallback to `documents` if table missing)
5. Mock data in executor is updated for immediate display
6. Response with confirmation sent to user

**Document Search Flow:**

1. User asks "find invoices" → `/api/assistant`
2. Orchestrator calls `search_documents` function with query
3. Executor queries Supabase `documents` table with scoring algorithm
4. Verifies Google Drive file IDs haven't been deleted
5. Returns results with Drive links
6. User can select specific document → orchestrator handles selection
7. Returns formatted response with file link

**Business Context Building:**

1. Every AI request triggers `buildBusinessContext()`
2. Fetches real-time QuickBooks bills (if authenticated)
3. Gets pending documents from Supabase
4. Combines with mock property and dispensary data
5. Provides Jane (the AI) full situational awareness
6. Used in system prompt to inform all responses

**State Management:**

- **Orchestrator State:** Conversation history, pending actions, invoice review state stored in `AIOrchestrator` class instance (singleton)
- **Component State:** Voice state (listening, speaking, error) via `useVoiceMode` hook
- **Session State:** User authentication via Supabase session in middleware and AppWrapper
- **Mock Data State:** In-memory arrays (`MOCK_ACCOUNTS`, `MOCK_PROPERTIES`, `MOCK_EXPENSES`) updated on operations

## Key Abstractions

**AIOrchestrator:**
- Purpose: Central AI brain that understands conversational context and routes to appropriate functions
- Examples: `src/lib/ai/orchestrator.ts` (1376 lines)
- Pattern: Singleton class managing conversation history, pending actions, function execution flow

**ExecuteFunction:**
- Purpose: Maps AI function calls to actual implementations (real APIs or mock data)
- Examples: `src/lib/ai/executor.ts` (1700+ lines)
- Pattern: Switch statement routing function names to implementations

**ProfileManager:**
- Purpose: Manages Mary's personal profile, preferences, memories, and context learning (Jarvis Mode)
- Examples: `src/lib/ai/profile-manager.ts`
- Pattern: Persistent storage of facts, contacts, preferences in Supabase profile table

**Document Control:**
- Purpose: Track documents from upload through review to filing
- Examples: Supabase `documents` table with status, drive_id, metadata
- Pattern: Status flow: needs_review → processed → confirmed → archived

**Voice Mode Hooks:**
- Purpose: Encapsulate STT (Deepgram or ElevenLabs Scribe) and TTS (ElevenLabs) logic
- Examples: `src/hooks/useDeepgram.ts`, `src/hooks/useElevenLabsTTS.ts`, `src/hooks/useVoiceMode.ts`
- Pattern: Custom React hooks managing WebSocket connections and audio state

## Entry Points

**Web App:**
- Location: `src/app/layout.tsx` (root layout), `src/app/page.tsx` (dashboard)
- Triggers: User navigates to URL
- Responsibilities: Initialize session, load AppWrapper, render dashboard with sidebar and AI panel

**API Assistant:**
- Location: `src/app/api/assistant/route.ts`
- Triggers: Frontend sends POST with user message
- Responsibilities: Call orchestrator, process AI response, return JSON

**Voice Entry:**
- Location: `src/components/voice/VoiceModeOverlay.tsx` (UI), `/api/voice/*` (endpoints)
- Triggers: User clicks "Voice Mode" button or starts speaking
- Responsibilities: Capture audio, send transcripts, receive and play audio responses

**Auth Callback:**
- Location: `src/app/auth/callback/route.ts`, `/api/auth/quickbooks/route.ts`
- Triggers: OAuth redirect from Supabase, QuickBooks
- Responsibilities: Exchange token for session, redirect to appropriate page

**Document Upload:**
- Location: `/api/files/upload/route.ts`
- Triggers: User uploads file in Files & Docs page
- Responsibilities: Store to Google Drive, create document record in Supabase, queue for review

**Middleware:**
- Location: `src/middleware.ts`
- Triggers: Every HTTP request
- Responsibilities: Check authentication, verify whitelist, refresh session, redirect unauthenticated users

## Error Handling

**Strategy:** Fail gracefully with fallback options; prioritize user experience over technical errors

**Patterns:**

- **API Integration Failures:** If QuickBooks unavailable, continue with Supabase-only storage. If Google Drive upload fails, store reference but allow review queue to work.
- **AI Errors:** Catch Gemini API errors, log with context, return friendly user message in production, debug error in development.
- **Missing Data:** Return sensible defaults (e.g., "Account not found" → help user search), don't throw.
- **Voice Mode:** Graceful degradation if audio APIs unavailable, show text-based fallback.
- **Document Search:** If Supabase query fails, return empty results with suggestion to try again.

Example from `orchestrator.ts`:
```typescript
try {
  const result = await executeFunction(functionName, functionArgs);
} catch (error) {
  const errorMsg = error instanceof Error ? error.message : 'Unknown error';
  const errorText = `Sorry, I ran into an issue: ${errorMsg}. Want me to try again?`;
  // Continue conversation instead of crashing
}
```

## Cross-Cutting Concerns

**Logging:**
- Approach: Console logging with context prefixes (`[AI]`, `[WebSearch]`, `✅`, `❌`)
- Locations: `src/lib/ai/orchestrator.ts`, `src/lib/ai/executor.ts`, API routes
- For debugging: Development mode returns detailed error messages; production hides technical details

**Validation:**
- Approach: Type checking via TypeScript interfaces; function parameter schemas in `AI_FUNCTIONS`
- Locations: `src/lib/ai/functions.ts` (parameter definitions), route handlers check required fields
- Example: `record_expense` requires `amount` and `vendor_or_description`

**Authentication:**
- Approach: Middleware-enforced session verification; email whitelist check
- Locations: `src/middleware.ts` (session refresh + whitelist), `src/lib/auth/whitelist.ts`
- Pattern: All routes except `/login`, `/auth`, `/api/auth` require valid session

**Conversation Memory:**
- Approach: Maintain conversation history in orchestrator state; save important facts to profile
- Locations: `conversationHistory` array in `AIOrchestrator`; `profileManager` for persistence
- Pattern: "You MUST remember everything said earlier in this conversation" (orchestrator.ts line 248)

**Response Formatting:**
- Approach: Natural language generation specific to function type
- Location: `generateFunctionResponse()` in `orchestrator.ts`
- Pattern: "Jane" voice consistent across all responses (no robotic "Here's what I found")

---

*Architecture analysis: 2026-01-27*
