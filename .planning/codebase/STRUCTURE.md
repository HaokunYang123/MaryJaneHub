# Codebase Structure

**Analysis Date:** 2026-01-27

## Directory Layout

```
mary-financial-center/
├── src/                        # Application source code
│   ├── app/                    # Next.js 16 app directory (pages, API routes)
│   │   ├── layout.tsx          # Root layout wrapper
│   │   ├── page.tsx            # Dashboard home page
│   │   ├── globals.css         # Global Tailwind styles
│   │   │
│   │   ├── login/              # Authentication entry point
│   │   │   └── page.tsx
│   │   │
│   │   ├── auth/               # OAuth callbacks
│   │   │   ├── callback/       # Supabase auth callback
│   │   │   │   └── route.ts
│   │   │   └── logout/         # Logout endpoint
│   │   │       └── route.ts
│   │   │
│   │   ├── ai/                 # Full-screen AI assistant page
│   │   │   └── page.tsx
│   │   │
│   │   ├── api/                # RESTful API routes
│   │   │   ├── assistant/      # Main AI endpoint
│   │   │   │   └── route.ts
│   │   │   │
│   │   │   ├── voice/          # Voice I/O endpoints
│   │   │   │   ├── tts/        # Text-to-speech tokens
│   │   │   │   └── stt-token/  # Speech-to-text tokens
│   │   │   │
│   │   │   ├── files/          # Document management
│   │   │   │   ├── upload/
│   │   │   │   ├── pending/
│   │   │   │   ├── confirm/
│   │   │   │   ├── reject/
│   │   │   │   ├── dismiss/
│   │   │   │   └── cleanup/
│   │   │   │
│   │   │   ├── invoices/       # Invoice operations
│   │   │   │   └── extract/    # Extract from PDF
│   │   │   │
│   │   │   ├── invoice/        # Invoice generation
│   │   │   │   ├── generate/
│   │   │   │   └── preview/[id]/
│   │   │   │
│   │   │   ├── quickbooks/     # QB integration
│   │   │   │   ├── accounts/
│   │   │   │   ├── bills/
│   │   │   │   ├── vendors/
│   │   │   │   ├── journal-entry/
│   │   │   │   ├── reports/
│   │   │   │   ├── callback/
│   │   │   │   └── check-invoice/
│   │   │   │
│   │   │   ├── sync/           # Data synchronization
│   │   │   │   └── drive/
│   │   │   │
│   │   │   └── ai/             # AI operations
│   │   │       └── agent/
│   │   │
│   │   └── [feature]/          # Feature pages (Bills, Inventory, etc.)
│   │       ├── page.tsx
│   │       └── (nested routes)
│   │
│   ├── components/             # React components
│   │   ├── layout/             # Layout & wrapper components
│   │   │   ├── app-wrapper.tsx       # Root wrapper, auth check
│   │   │   ├── dashboard-layout.tsx  # Dashboard grid layout
│   │   │   ├── header.tsx            # Top navigation
│   │   │   ├── sidebar.tsx           # Left navigation menu
│   │   │   ├── ai-sidebar.tsx        # AI assistant sidebar
│   │   │   ├── footer.tsx            # Footer
│   │   │   ├── floating-ai-button.tsx
│   │   │   └── ai-assistant-panel.tsx
│   │   │
│   │   ├── dashboard/          # Dashboard card components
│   │   │   ├── cash-position-card.tsx
│   │   │   ├── alerts-card.tsx
│   │   │   ├── accounts-receivable-card.tsx
│   │   │   ├── accounts-payable-card.tsx
│   │   │   ├── inventory-card.tsx
│   │   │   └── payroll-card.tsx
│   │   │
│   │   ├── ui/                 # Reusable UI primitives
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── table.tsx
│   │   │   └── animated-number.tsx
│   │   │
│   │   ├── voice/              # Voice mode components
│   │   │   └── VoiceModeOverlay.tsx
│   │   │
│   │   ├── widgets/            # Feature-specific widgets
│   │   │   └── doc-review-queue.tsx
│   │   │
│   │   └── providers/          # Context providers
│   │       └── (context setup)
│   │
│   ├── lib/                    # Business logic & utilities
│   │   ├── ai/                 # AI orchestration
│   │   │   ├── orchestrator.ts      # Main AI brain (1376 lines)
│   │   │   ├── executor.ts          # Function execution (1700+ lines)
│   │   │   ├── functions.ts         # Function definitions
│   │   │   ├── profile-manager.ts   # Personal profile (Jarvis mode)
│   │   │   └── secretary.ts         # Secretary agent
│   │   │
│   │   ├── auth/               # Authentication
│   │   │   └── whitelist.ts         # Email whitelist
│   │   │
│   │   ├── supabase/           # Database & session
│   │   │   ├── client.ts            # Browser client
│   │   │   ├── server.ts            # Server client
│   │   │   └── middleware.ts        # Session refresh
│   │   │
│   │   ├── quickbooks.ts       # QB integration client
│   │   ├── google-drive.ts      # Google Drive integration
│   │   ├── gemini.ts            # Gemini API client setup
│   │   ├── sync-engine.ts       # Data sync orchestrator
│   │   ├── invoice-extractor.ts # PDF invoice extraction
│   │   ├── invoice-generator.ts # PDF invoice creation
│   │   ├── document-generator.ts # Financial report generation
│   │   ├── supabase.ts          # Supabase main client
│   │   └── utils.ts             # Utility functions (cn, etc.)
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── useDeepgram.ts          # Speech-to-text
│   │   ├── useElevenLabsTTS.ts     # Text-to-speech
│   │   ├── useVoiceMode.ts         # Voice mode orchestration
│   │   ├── useAnimatedNumber.ts
│   │   └── index.ts                # Exports
│   │
│   ├── types/                  # TypeScript type definitions
│   │   └── voice.ts                # Voice-related types
│   │
│   └── middleware.ts           # Next.js request middleware
│
├── .env.example                # Environment variables template
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
├── next.config.js              # Next.js config
└── tailwind.config.js          # Tailwind CSS config
```

## Directory Purposes

**`src/app`:**
- Purpose: Next.js app router pages and API endpoints
- Contains: Page files (`.tsx`), API route handlers (`.ts`), layouts
- Key files: `layout.tsx` (root), `page.tsx` (home), `api/assistant/route.ts` (AI)

**`src/app/api`:**
- Purpose: RESTful API endpoints for all backend operations
- Contains: Route handlers that process requests and return JSON
- Organization: Grouped by feature (assistant, voice, files, quickbooks, sync)

**`src/components/layout`:**
- Purpose: Structural components that define page layout
- Contains: AppWrapper (auth wrapper), DashboardLayout (grid), Header, Sidebar, AI panels
- Key pattern: AppWrapper checks auth on mount, renders children with sidebar if authenticated

**`src/components/dashboard`:**
- Purpose: Dashboard overview cards showing financial snapshots
- Contains: CashPositionCard, AlertsCard, AccountsPayableCard, etc.
- Data source: Calls to `/api/assistant` via Gemini function calls

**`src/lib/ai`:**
- Purpose: Core AI orchestration and execution engine
- Contains: `orchestrator.ts` (1376 lines) - main conversation handler, `executor.ts` (1700 lines) - function implementations
- Pattern: Orchestrator routes natural language to functions; Executor calls real APIs or returns mock data

**`src/lib/supabase`:**
- Purpose: Database interaction and session management
- Contains: Client setup, server-side utilities, middleware for session refresh
- Key pattern: Uses Supabase SSR pattern for secure server-side operations

**`src/hooks`:**
- Purpose: Reusable React logic for voice, animation, and custom behavior
- Contains: `useVoiceMode` orchestrates entire voice flow; `useDeepgram` and `useElevenLabsTTS` handle audio
- Pattern: Each hook manages WebSocket connections and state updates

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root layout that wraps all pages with AppWrapper
- `src/app/page.tsx`: Dashboard home page, renders dashboard cards
- `src/middleware.ts`: Middleware that runs on every request for auth check

**Configuration:**
- `package.json`: Dependencies (Next.js, React 19, Supabase, Gemini, ElevenLabs, etc.)
- `tsconfig.json`: Path alias `@/*` → `./src/*`
- `next.config.js`: Next.js configuration
- `tailwind.config.js`: Tailwind CSS setup

**Core Logic:**
- `src/lib/ai/orchestrator.ts`: AI brain that understands Mary's requests
- `src/lib/ai/executor.ts`: Executes AI function calls (record expense, search documents, etc.)
- `src/lib/ai/functions.ts`: Definitions of all available AI functions
- `src/lib/ai/profile-manager.ts`: Manages Mary's personal profile and learning

**API Routes:**
- `src/app/api/assistant/route.ts`: Main endpoint for conversational AI
- `src/app/api/voice/tts/route.ts`: Text-to-speech token generation
- `src/app/api/files/upload/route.ts`: Document upload handling
- `src/app/api/quickbooks/bills/route.ts`: QuickBooks bill queries

**Authentication:**
- `src/app/auth/callback/route.ts`: Supabase OAuth callback
- `src/lib/auth/whitelist.ts`: Email whitelist for access control
- `src/lib/supabase/middleware.ts`: Session refresh and whitelist check
- `src/middleware.ts`: Top-level request protection

## Naming Conventions

**Files:**
- Pages: `page.tsx` (Next.js convention)
- API routes: `route.ts` (Next.js convention)
- Components: PascalCase (e.g., `CashPositionCard.tsx`)
- Hooks: `use` prefix (e.g., `useVoiceMode.ts`)
- Utilities: camelCase (e.g., `invoice-generator.ts`)
- Types: same file name or `types/` directory

**Directories:**
- Feature directories: kebab-case (e.g., `api/quickbooks`, `components/dashboard`)
- Organized by domain: `api/`, `components/`, `lib/`, `hooks/`, `types/`

**Functions & Variables:**
- Functions: camelCase (e.g., `executeFunction()`, `processInput()`)
- Classes: PascalCase (e.g., `AIOrchestrator`, `ProfileManager`)
- Constants: UPPER_SNAKE_CASE (e.g., `AI_FUNCTIONS`, `WRITE_OPERATIONS`)
- React components: PascalCase (e.g., `DashboardLayout()`)

## Where to Add New Code

**New Feature:**
- Primary code: `src/lib/` or `src/app/api/[feature]/`
- Tests: (Testing framework not detected - see TESTING.md)
- Example: Adding expense tracking → `src/lib/expense-tracker.ts` + `/api/expenses/route.ts`

**New Component/Module:**
- Implementation: `src/components/[category]/ComponentName.tsx`
- If reusable widget: `src/components/widgets/` or `src/components/ui/`
- If page-specific: `src/components/dashboard/` or `src/components/layout/`

**New API Endpoint:**
- Pattern: `src/app/api/[feature]/[action]/route.ts`
- Example: Getting bank balances → `src/app/api/accounts/balances/route.ts`

**New AI Function:**
- Define in: `src/lib/ai/functions.ts` (add to `AI_FUNCTIONS` array)
- Implement in: `src/lib/ai/executor.ts` (add case in switch statement)
- Pattern: Function definition with parameter schema → Executor switch case

**New Hook:**
- Location: `src/hooks/useFeatureName.ts`
- Export from: `src/hooks/index.ts`
- Pattern: Custom hook managing state and side effects

**Shared Utilities:**
- Simple utilities: `src/lib/utils.ts`
- Domain-specific: `src/lib/[domain]/` (e.g., `src/lib/supabase/`, `src/lib/ai/`)

## Special Directories

**`src/app/api/`:**
- Purpose: RESTful API endpoints
- Generated: No
- Committed: Yes
- Pattern: Each `route.ts` file is an endpoint; can have `POST`, `GET`, `DELETE` exports
- Example: `src/app/api/assistant/route.ts` handles `POST /api/assistant`

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes (on `npm run build`)
- Committed: No

**`node_modules/`:**
- Purpose: Installed dependencies
- Generated: Yes (on `npm install`)
- Committed: No

**`.env.local`:**
- Purpose: Local environment variables (secrets)
- Generated: Manually created (use `.env.example` as template)
- Committed: No (in `.gitignore`)

**`src/lib/supabase/`:**
- Purpose: Database client setup
- Pattern: Separate clients for browser (`client.ts`) and server (`server.ts`)
- Middleware handles cookie-based session refresh

**`src/app/api/files/`:**
- Purpose: Document upload and management endpoints
- Routes: `/upload` (POST), `/pending` (GET), `/confirm` (POST), `/reject` (POST), `/dismiss` (POST), `/cleanup` (POST)
- Data storage: Google Drive (files) + Supabase `documents` table (metadata)

---

*Structure analysis: 2026-01-27*
