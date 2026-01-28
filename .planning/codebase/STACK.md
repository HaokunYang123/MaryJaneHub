# Technology Stack

**Analysis Date:** 2026-01-27

## Languages

**Primary:**
- TypeScript 5 - All source code in `src/` directory
- JavaScript (JSX/TSX) - React components throughout

**Secondary:**
- CSS - TailwindCSS v4 for styling in `src/app/globals.css`

## Runtime

**Environment:**
- Node.js (version not explicitly specified, inferred from Next.js 16.1.2 requirements)

**Package Manager:**
- npm - Lockfile present: `package-lock.json`

## Frameworks

**Core:**
- Next.js 16.1.2 - Full-stack React framework with app router at `src/app/`
- React 19.2.3 - UI library
- React DOM 19.2.3 - DOM rendering

**UI Components & Styling:**
- TailwindCSS 4 - Utility CSS framework
- TailwindCSS PostCSS 4 - PostCSS plugin for Tailwind
- Radix UI (@radix-ui/react-slot 1.2.4) - Headless component primitives
- Lucide React 0.562.0 - Icon library
- clsx 2.1.1 - Conditional class name utility
- tailwind-merge 3.4.0 - Tailwind class merging
- class-variance-authority 0.7.1 - Component variant management
- @paper-design/shaders-react 0.0.70 - Shader effects library
- tw-animate-css 1.4.0 - Animation utilities (dev dependency)

**Testing:**
- ESLint 9 - Code linting
- ESLint Config Next 16.1.2 - Next.js specific linting rules

**Build/Dev:**
- TypeScript 5 - Type checking and compilation
- PostCSS - CSS processing via `postcss.config.mjs`

## Key Dependencies

**Critical:**

**AI & Language Models:**
- @google/generative-ai 0.24.1 - Google Gemini API client
- @langchain/core 1.1.15 - LangChain core abstractions
- @langchain/community 1.1.4 - LangChain community integrations
- @langchain/google-genai 2.1.10 - LangChain Google Gemini integration
- langchain 0.3.0 - Main LangChain library

**Database & Backend:**
- @supabase/supabase-js 2.90.1 - Supabase client (PostgreSQL + Auth)
- @supabase/ssr 0.8.0 - Supabase SSR utilities for Next.js
- pg 8.17.1 - PostgreSQL native driver
- axios 1.13.2 - HTTP client for API calls

**Financial Integration:**
- intuit-oauth 4.2.2 - QuickBooks OAuth client
- googleapis 170.0.0 - Google Drive API client

**PDF Processing:**
- pdfkit 0.17.2 - PDF generation
- pdf-lib 1.17.1 - PDF manipulation
- pdf-parse 2.4.5 - PDF content extraction
- @types/pdfkit 0.17.4 - TypeScript types for pdfkit

**Authentication:**
- next-auth 4.24.13 - Authentication for Next.js

**Environment & Configuration:**
- dotenv 16.4.7 - Environment variable loading

## Configuration

**Environment:**
- Environment variables configured via `.env.local`
- Key configs required:
  - `NEXT_PUBLIC_SUPABASE_URL` - Supabase database endpoint
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
  - `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role for server operations
  - `GEMINI_API_KEY` - Google Gemini API key
  - `TIER1_MODEL` - Model for fast classification (gemini-2.0-flash-lite)
  - `TIER2_MODEL` - Model for deep extraction (gemini-2.5-flash)
  - `TIER3_MODEL` - Model for expert analysis (gemini-2.5-pro)
  - `QUICKBOOKS_CLIENT_ID` - OAuth client ID
  - `QUICKBOOKS_CLIENT_SECRET` - OAuth client secret
  - `QUICKBOOKS_ENVIRONMENT` - sandbox or production
  - `QUICKBOOKS_REDIRECT_URI` - OAuth redirect endpoint
  - `ELEVENLABS_API_KEY` - Text-to-speech API key
  - `ELEVENLABS_VOICE_ID` - Voice ID for TTS (default: EXAVITQu4vr4xnSDxMaL)
  - `NEXTAUTH_SECRET` - Authentication secret key
  - `NEXTAUTH_URL` - Base URL for authentication
  - `GOOGLE_SERVICE_ACCOUNT_JSON` - Service account credentials for Drive
  - `GOOGLE_SHARED_DRIVE_ID` - Shared Drive ID for file syncing

**Build:**
- `next.config.ts` - Next.js configuration
  - `serverExternalPackages: ["pdf-parse"]` - Mark pdf-parse for server-only bundling
  - Server Actions body size limit: 10mb
- `tsconfig.json` - TypeScript configuration
  - Target: ES2017
  - Module resolution: bundler
  - Strict mode enabled
  - Path aliases: `@/*` → `./src/*`
- `postcss.config.mjs` - PostCSS configuration for TailwindCSS
- `eslint.config.mjs` - ESLint configuration

## Platform Requirements

**Development:**
- Node.js (requires modern version compatible with Next.js 16)
- npm for package management
- Git for version control

**Production:**
- Deployment target: Node.js compatible hosting (Vercel, AWS Lambda, Docker, etc.)
- Environment variables must be set in production environment
- Requires internet connectivity for:
  - Supabase (PostgreSQL cloud DB)
  - Google APIs (Gemini, Drive)
  - QuickBooks OAuth
  - ElevenLabs TTS API

---

*Stack analysis: 2026-01-27*
