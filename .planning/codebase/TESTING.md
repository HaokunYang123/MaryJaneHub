# Testing Patterns

**Analysis Date:** 2026-01-27

## Test Framework

**Runner:**
- No test runner currently configured (Jest, Vitest, etc. not in package.json)
- No test files found in `/src` directory
- Testing infrastructure not implemented

**Assertion Library:**
- Not detected

**Run Commands:**
- No test commands available
- Linting command available: `npm run lint` (runs eslint)

## Test File Organization

**Current State:**
- No test files present in codebase
- No dedicated test directories (`__tests__`, `tests/`, `*.test.ts`, `*.spec.ts`)
- Test infrastructure opportunity exists for future implementation

## Test Coverage

**Requirements:**
- Not enforced (no coverage configuration present)

## Testing Approach (Current Patterns)

While formal testing is not yet implemented, the codebase demonstrates testable design patterns:

**1. Function Isolation:**
Functions designed with clear inputs and outputs, making them amenable to unit testing:

From `executor.ts`:
```typescript
// This pattern enables easy mocking of dependencies
export async function executeFunction(functionName: string, args: Record<string, any>): Promise<any> {
  await new Promise(resolve => setTimeout(resolve, 300)); // Simulated latency

  switch (functionName) {
    case 'record_expense': {
      // ... operation returns typed result
      return { success: true, expense };
    }
  }
}
```

**2. Mock Data Pattern:**
Extensive use of mock data for testing without real APIs:

From `executor.ts`:
```typescript
// Mock data for realistic demo - California properties
const MOCK_PROPERTIES: Property[] = [
  { id: 'prop_riverside', name: 'Riverside Property', address: '1234 University Ave, Riverside, CA', tenant: '8 Units - Various Tenants', monthlyRent: 12000 },
  { id: 'prop_corona', name: 'Corona Property', address: '456 Main St, Corona, CA', tenant: '12 Units - Various Tenants', monthlyRent: 18000 },
];

const MOCK_ACCOUNTS: BankAccount[] = [
  { id: 'acc_1', name: 'Operating Account - Main', type: 'checking', balance: 847234.56, bank: 'Chase', lowThreshold: 50000 },
  // ... more accounts
];

const MOCK_EXPENSES: Expense[] = [
  { id: 'exp_1', date: '2024-03-01', amount: 400, vendor: 'CoolAir HVAC Services', category: 'Repairs & Maintenance', property: 'Riverside Property' },
];
```

**3. Type-Driven Development:**
Interfaces define expected inputs and outputs, making contract-driven testing possible:

From `orchestrator.ts`:
```typescript
interface AIFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export class AIOrchestrator {
  async processInput(userMessage: string, _pageContext?: string): Promise<OrchestratorResponse> {
    // Type contract ensures test inputs match expected interface
  }
}
```

**4. Error Handling Testing Opportunity:**
Current pattern differentiates development vs. production errors:

```typescript
try {
  // operation
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (process.env.NODE_ENV === 'development') {
    return { text: `Debug Error: ${errorMessage}`, action: 'error' };
  }

  return { text: "I'm having trouble processing that right now.", action: 'error' };
}
```

This pattern enables testing error recovery paths.

## Dependency Injection Pattern

Functions accept dependencies as parameters or via class constructors:

From `orchestrator.ts`:
```typescript
export class AIOrchestrator {
  private genAI: GoogleGenerativeAI;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
  }
}
```

This design allows injecting mock instances during testing.

## Integration Points for Testing

**APIs and External Services:**
- QuickBooks integration: `src/lib/quickbooks.ts` - Can be mocked via mock implementations
- Google Drive: `src/lib/google-drive.ts` - File operations can be stubbed
- Supabase: `src/lib/supabase/` - Database operations can use test instances
- Gemini AI: `@google/generative-ai` - Responses can be mocked

From `orchestrator.ts`:
```typescript
// Current pattern uses conditional logic for demo/real data
try {
  const bills = await quickbooks.getBills();
  const outstandingBills = bills.filter((b: { Balance?: number }) => b.Balance && b.Balance > 0);
} catch (billErr) {
  console.error('Failed to fetch bills:', billErr);
  // Gracefully degrades without bills data
}
```

## Async Testing Patterns

Current code uses async/await throughout, compatible with modern test frameworks:

From `orchestrator.ts`:
```typescript
async processInput(userMessage: string, _pageContext?: string): Promise<OrchestratorResponse> {
  // Multiple sequential async operations
  const profileContext = await profileManager.getProfileSummary();
  const businessContext = await this.buildBusinessContext();
  const result = await chat.sendMessage(fullMessage);
}
```

Test structure would mirror this:
```typescript
// Pattern for testing async operations
test('should process user input and return response', async () => {
  const orchestrator = new AIOrchestrator();
  const result = await orchestrator.processInput('test message');
  expect(result.text).toBeDefined();
  expect(result.action).toBeDefined();
});
```

## Testing Opportunities

**High Priority Areas:**
1. **AI Function Executor** (`src/lib/ai/executor.ts`) - Core business logic, many branches
2. **Orchestrator Logic** (`src/lib/ai/orchestrator.ts`) - Complex state management, confirmation flows
3. **API Routes** (`src/app/api/**`) - Request/response handling, error cases
4. **QuickBooks Integration** (`src/lib/quickbooks.ts`) - External API reliability

**Recommended Test Framework:**
- Vitest: Fast, TypeScript-first, minimal config
- Or Jest: Widely used, comprehensive, better for larger test suites

**Recommended Setup:**
```typescript
// vitest.config.ts structure
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html']
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

## Test File Organization (Recommended)

**Location:** Co-locate tests with source code

```
src/lib/ai/
├── orchestrator.ts
├── orchestrator.test.ts
├── executor.ts
├── executor.test.ts
└── functions.ts
```

Or separate directory:

```
src/
├── lib/
├── __tests__/
│   └── lib/
│       ├── orchestrator.test.ts
│       └── executor.test.ts
```

## Mock Data Strategy

Leverage existing mock data structure:

```typescript
// src/lib/test-fixtures.ts (recommended)
export const mockProperties: Property[] = [
  { id: 'prop_riverside', name: 'Riverside Property', ... },
];

export const mockAccounts: BankAccount[] = [
  { id: 'acc_1', name: 'Operating Account - Main', ... },
];

// In tests:
import { mockProperties, mockAccounts } from '@/lib/test-fixtures';
```

## API Testing Pattern

```typescript
// Example test for API route (src/app/api/assistant/route.test.ts)
import { POST } from '@/app/api/assistant/route';
import { NextRequest } from 'next/server';

describe('Assistant API', () => {
  it('should return error for missing message', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('should process user message and return response', async () => {
    const req = new NextRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toBeDefined();
  });
});
```

## Component Testing Pattern

```typescript
// Example test for sidebar component (src/components/layout/sidebar.test.tsx)
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';
import { usePathname } from 'next/navigation';

jest.mock('next/navigation');

describe('Sidebar', () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue('/');
  });

  it('should render navigation items', () => {
    render(<Sidebar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
  });

  it('should highlight active route', () => {
    (usePathname as jest.Mock).mockReturnValue('/ai');
    render(<Sidebar />);
    const aiLink = screen.getByText('AI Assistant').closest('a');
    expect(aiLink).toHaveClass('bg-[#1B5E20]');
  });
});
```

## Current Testing Status

**Coverage:** 0% - No tests implemented
**Readiness for Testing:** High - Code is well-structured with clear boundaries
**Priority:** Medium to High - Complex AI logic and external integrations would benefit from test coverage

---

*Testing analysis: 2026-01-27*
