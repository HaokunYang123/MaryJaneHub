# Coding Conventions

**Analysis Date:** 2026-01-27

## Naming Patterns

**Files:**
- Page components: PascalCase with `.tsx` extension (e.g., `page.tsx`, `route.ts`)
- API routes: `route.ts` in `/api/[feature]/[action]/` directory structure
- Component files: PascalCase (e.g., `Sidebar.tsx`, `VoiceModeOverlay.tsx`)
- Utility/library files: camelCase (e.g., `orchestrator.ts`, `invoice-generator.ts`)
- Hook files: camelCase starting with `use` (e.g., `useVoiceMode.ts`, `useDeepgram.ts`)
- Type definition files: PascalCase or camelCase based on content (e.g., `voice.ts`)

**Functions:**
- Exported functions: camelCase (e.g., `createClient()`, `executeFunction()`, `generateInvoicePDF()`)
- React component functions: PascalCase (e.g., `function Sidebar()`, `export function NavItem()`)
- Private helper functions: camelCase (e.g., `getDriveLink()`, `getDueDate()`, `removeEmDashes()`)
- Event handlers: camelCase, often prefixed with `handle` or action name (e.g., `handlePropertySelection()`, `isConfirmation()`)
- Async functions: same conventions with `async` keyword

**Variables:**
- Constant objects/arrays: UPPERCASE_SNAKE_CASE for module-level constants (e.g., `MOCK_PROPERTIES`, `WRITE_OPERATIONS`, `SYSTEM_PROMPT`)
- State variables: camelCase (e.g., `conversationHistory`, `pendingAction`, `lastSearchResults`)
- Interface/type instances: camelCase (e.g., `fullMessage`, `functionArgs`, `propertyResult`)
- Boolean variables: often prefixed with `is` or `has` (e.g., `isAuthenticated`, `isConfirmation`, `requiresConfirmation()`)

**Types:**
- Interfaces: PascalCase (e.g., `AIFunction`, `PendingAction`, `OrchestratorResponse`, `Message`)
- Type aliases: PascalCase (e.g., `Content`, `FunctionDeclaration`)
- Generic type parameters: single uppercase letters or descriptive PascalCase (e.g., `<T>`, `<Props>`)

## Code Style

**Formatting:**
- ESLint with Next.js config (eslint-config-next) enforces style rules
- Config: `eslint.config.mjs` (flat config format in ESLint v9)
- Indentation: 2 spaces (TypeScript strict mode)
- Line length: No hard limit observed but code stays under 120 chars typically
- Semicolons: Required (enforced by ESLint)

**Linting:**
- Tool: ESLint v9 with Next.js core web vitals and TypeScript configurations
- Rules applied: ESLint-config-next core rules, TypeScript strict type checking
- Notable enforced rules:
  - `strict: true` in tsconfig.json requires full type safety
  - No implicit `any` types (requires explicit type annotations)
  - ESLint disables applied inline when needed: `// eslint-disable-next-line @typescript-eslint/no-explicit-any`

**Code Organization:**
- "use client" directive at top of client components in Next.js App Router
- Imports organized in groups: standard library, external packages, internal imports
- Path aliases used throughout: `@/` points to `./src/`

## Import Organization

**Order:**
1. Standard library imports (React, Next.js)
2. External package imports (@google/generative-ai, zod, etc.)
3. Internal imports (lib, components, hooks) using `@/` alias

**Path Aliases:**
- `@/*` maps to `./src/*` (defined in tsconfig.json)
- Used exclusively for internal imports to simplify refactoring and readability

**Example pattern from `orchestrator.ts`:**
```typescript
import { GoogleGenerativeAI, Content, FunctionDeclaration } from "@google/generative-ai";
import { AI_FUNCTIONS, WRITE_OPERATIONS, PROPERTY_KEYWORDS } from "./functions";
import { executeFunction } from "./executor";
import { profileManager } from "./profile-manager";
import { supabase } from "@/lib/supabase";
```

## Error Handling

**Patterns:**
- Errors caught with try-catch blocks wrapping async operations
- Error messages logged with context: `console.error('Description:', error)`
- Errors in production return user-friendly messages, not raw error objects
- Development mode returns detailed error messages for debugging
- Function result objects often include `success: boolean` and `error?: string` properties

**Example from orchestrator.ts:**
```typescript
try {
  // operation
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (process.env.NODE_ENV === 'development') {
    return {
      text: `Debug Error: ${errorMessage}`,
      action: 'error'
    };
  }

  return {
    text: "I'm having trouble processing that right now. Could you try again?",
    action: 'error'
  };
}
```

**API Route Pattern:**
- POST/GET handlers catch errors and return NextResponse.json with appropriate status codes
- 400 for bad input (missing required fields)
- 500 for server errors
- Conditional error detail based on NODE_ENV

## Logging

**Framework:** console methods (console.log, console.error, console.warn)

**Patterns:**
- Logged with context tags in brackets: `console.log('[AI Page] Message', data)`
- Error logging includes function/operation context: `console.error('CRITICAL AI ORCHESTRATOR ERROR:', error)`
- Emoji prefixes for visual scanning: `✅ ⚠️ 📄 📥 ❌`
- Logs filtered out in production (only visible in development logs)

**Specific conventions:**
- Auth operations: `[Auth Callback]`
- AI operations: `[AI Page]`, `CRITICAL AI ORCHESTRATOR ERROR`
- File operations: `[File Name] operation description`
- Drive operations: Include file ID: `✅ Invoice uploaded to Google Drive: ${driveFileId}`

## Comments

**When to Comment:**
- Complex logic that isn't self-explanatory (e.g., long system prompts)
- Sections dividing major functionality blocks: `// === SECTION NAME ===`
- Disabled code or workarounds with explanation
- Function behavior that differs from standard patterns

**JSDoc/TSDoc:**
- Not consistently used throughout codebase
- Type annotations used instead of JSDoc for parameters
- Comments preferred for complex business logic

**Example from orchestrator.ts:**
```typescript
// AI Orchestrator - The "Brain" that processes Mary's requests
// Uses Gemini 2.5 Pro with function calling + Personal Profile (Jarvis Mode)

// === JARVIS MODE: Load Mary's personal profile ===
let profileContext = '';
try {
  profileContext = await profileManager.getProfileSummary();
  // Track what Mary is asking about
  await profileManager.trackTopic(userMessage.slice(0, 100));
} catch (profileError) {
  console.error('Failed to load profile:', profileError);
  profileContext = '(Profile not available)';
}
```

## Function Design

**Size:** Functions are moderately sized, with complex ones (like `processInput()`) reaching 200+ lines when necessary

**Parameters:**
- Typed explicitly with interfaces/types, not bare objects
- Often destructured from interfaces: `constructor() { this.apiKey = process.env.GEMINI_API_KEY || ''; }`
- Optional parameters handled with `?:` syntax in interfaces

**Return Values:**
- Functions return typed objects (interfaces or type aliases)
- Async functions return `Promise<T>` with explicit return type
- Functions that may fail return wrapper objects with `success` or `error` properties

**Example from executor.ts:**
```typescript
interface Property {
  id: string;
  name: string;
  address: string;
  tenant?: string | null;
  monthlyRent?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeFunction(functionName: string, args: Record<string, any>): Promise<any> {
  // ... logic
  switch (functionName) {
    case 'record_expense': {
      // ... operation
      return { success: true, expense };
    }
  }
}
```

## Module Design

**Exports:**
- Named exports for most functions and classes
- Default exports rare (used for singleton instances or middleware)
- Barrel files not observed in codebase

**Module Organization:**
- Closely related functions grouped by purpose
- AI functions organized by category with comments: `// ===== EXPENSE RECORDING =====`
- Utility modules export multiple focused functions

**Example from orchestrator.ts:**
- Class `AIOrchestrator` exported with public methods
- Singleton instance exported: `export const aiOrchestrator = new AIOrchestrator();`
- Private methods prefixed with `private` keyword (TypeScript)

## TypeScript Patterns

**Type Safety:**
- `strict: true` in tsconfig enforces full type checking
- Explicit `any` type avoided; when necessary, uses `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
- Readonly properties for immutable data
- Union types for discriminated values (e.g., role: 'owner' | 'accountant' | 'admin')

**Interface Inheritance:**
- Interfaces extended when appropriate (e.g., content extending for response types)
- Discriminated unions used for function overloads/variants

**Example:**
```typescript
interface OrchestratorResponse {
  text: string;
  action: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  pendingAction?: PendingAction;
}
```

## React Component Conventions

**Client Components:**
- `"use client"` directive at file top for interactive components
- Hooks used for state management: `useState`, `useRef`, `useEffect`, `useCallback`
- Dependency arrays in useEffect properly maintained
- Custom hooks created for reusable logic (e.g., `useVoiceMode()`)

**Component Structure:**
- Props typed with interfaces
- Event handlers defined with `const` arrow functions
- Children and layout components composed cleanly

---

*Convention analysis: 2026-01-27*
