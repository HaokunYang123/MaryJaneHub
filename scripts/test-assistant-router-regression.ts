#!/usr/bin/env npx tsx
/**
 * Deterministic regression tests for assistant routing/clarification behavior.
 * Uses handleAssistantQuery (same entrypoint as assistant-cli) with stubbed handlers.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import {
  handleAssistantQuery,
  createConversationContext,
  type AssistantHandlers,
} from "../lib/assistant/clarify";
import type { AssistantResponse, Intent, QAResult, RAGResult, SumResult, Slots } from "../lib/assistant/types";

type ExpectedClarification = "yes" | "no" | "optional";
type ExpectedIntent = Intent | Intent[];

interface TestCase {
  id: string;
  description: string;
  query: string;
  expectedIntent: ExpectedIntent;
  expectedClarification: ExpectedClarification;
  disallowedIntents?: Intent[];
  assertSql?: boolean;
}

interface Trace {
  executeSearch: number;
  executeSum: number;
  executeRAG: number;
  answerSingleDocumentQuestion: number;
}

const TEST_CASES: TestCase[] = [
  // === Known failure regressions (from manual report) ===
  {
    id: "A",
    description: "Bega invoice date should be single_qa (not search)",
    query: "when was the Bega invoice dated?",
    expectedIntent: "single_qa",
    expectedClarification: "optional",
  },
  {
    id: "B",
    description: "FedEx invoice number should be single_qa (not search)",
    query: "what's the invoice number for FedEx?",
    expectedIntent: "single_qa",
    expectedClarification: "optional",
  },
  {
    id: "C",
    description: "Specific invoice total should be single_qa (not sum)",
    query: "what's the total for the January 19 invoice?",
    expectedIntent: "single_qa",
    expectedClarification: "optional",
  },
  {
    id: "D",
    description: "Overview of invoices should be rag (not search)",
    query: "give me an overview of 2024 invoices",
    expectedIntent: "rag",
    expectedClarification: "optional",
    disallowedIntents: ["search"],
  },
  {
    id: "E",
    description: "Ambiguous follow-up should clarify (not rag)",
    query: "the Bega one",
    expectedIntent: ["search", "single_qa"],
    expectedClarification: "yes",
    disallowedIntents: ["rag"],
  },
  {
    id: "F",
    description: "Bare summarize should be rag or clarify (not search)",
    query: "summarize",
    expectedIntent: "rag",
    expectedClarification: "optional",
    disallowedIntents: ["search"],
  },

  // === Control cases (should remain stable) ===
  {
    id: "G",
    description: "Clear search query",
    query: "find all FedEx invoices",
    expectedIntent: "search",
    expectedClarification: "no",
  },
  {
    id: "H",
    description: "Clear sum query across year range (SQL path)",
    query: "what is the total for 2024 receipts",
    expectedIntent: "sum",
    expectedClarification: "no",
    assertSql: true,
  },
  {
    id: "I",
    description: "Clear RAG question",
    query: "tell me about our relationship with Bega",
    expectedIntent: "rag",
    expectedClarification: "no",
  },
  {
    id: "J",
    description: "Clear single_qa question",
    query: "what's the total on the Centerpointe invoice?",
    expectedIntent: "single_qa",
    expectedClarification: "no",
  },
];

function createTrace(): Trace {
  return {
    executeSearch: 0,
    executeSum: 0,
    executeRAG: 0,
    answerSingleDocumentQuestion: 0,
  };
}

function createTestHandlers(trace: Trace): AssistantHandlers {
  return {
    executeSearch: async () => {
      trace.executeSearch += 1;
      return {
        success: true,
        message: "Mock search results (0).",
        results: [],
        count: 0,
        processingTimeMs: 1,
      };
    },
    executeSum: async (slots: Slots): Promise<SumResult> => {
      trace.executeSum += 1;
      return {
        total: 123.45,
        count: 3,
        average: 41.15,
        breakdown: undefined,
        filters: {
          documentType: slots.documentType,
          year: slots.year,
          vendor: slots.vendor,
        },
        confidence: "high",
        sqlQuery: "mock:select sum(total) from documents",
      };
    },
    executeRAG: async (): Promise<RAGResult> => {
      trace.executeRAG += 1;
      return {
        answer: "Mock RAG answer.",
        citations: [],
        documentsUsed: [],
        confidence: "high",
      };
    },
    answerSingleDocumentQuestion: async (_query: string, slots: Slots): Promise<QAResult> => {
      trace.answerSingleDocumentQuestion += 1;
      return {
        answer: "Mock QA answer.",
        citations: [],
        confidence: "high",
        allCitationsVerified: true,
        documentUsed: {
          id: "mock-doc",
          fileName: "mock.pdf",
          documentType: slots.documentType || "invoice",
        },
      };
    },
  };
}

function normalizeExpectedIntent(expected: ExpectedIntent): Intent[] {
  return Array.isArray(expected) ? expected : [expected];
}

function getActualIntent(response: AssistantResponse, trace: Trace): Intent | "unknown" {
  if (trace.answerSingleDocumentQuestion > 0) return "single_qa";
  if (trace.executeSum > 0) return "sum";
  if (trace.executeRAG > 0) return "rag";
  if (trace.executeSearch > 0) return "search";
  if (response.type === "clarification") {
    return response.context.pendingClarification?.originalIntent || "unknown";
  }
  return "unknown";
}

function formatClarify(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

async function runTest(testCase: TestCase) {
  const trace = createTrace();
  const handlers = createTestHandlers(trace);
  const context = createConversationContext();

  const response = await handleAssistantQuery(testCase.query, context, handlers);
  const actualClarify = response.type === "clarification";
  const actualIntent = getActualIntent(response, trace);

  const expectedIntents = normalizeExpectedIntent(testCase.expectedIntent);
  const failures: string[] = [];

  if (!expectedIntents.includes(actualIntent as Intent)) {
    failures.push(`intent ${actualIntent} not in [${expectedIntents.join(", ")}]`);
  }

  if (testCase.disallowedIntents?.includes(actualIntent as Intent)) {
    failures.push(`intent ${actualIntent} is disallowed`);
  }

  if (testCase.expectedClarification === "yes" && !actualClarify) {
    failures.push("clarification not triggered");
  }

  if (testCase.expectedClarification === "no" && actualClarify) {
    failures.push("unexpected clarification");
  }

  if (testCase.assertSql) {
    const sqlUsed = trace.executeSum > 0 && Boolean(response.sumResult?.sqlQuery);
    if (!sqlUsed) {
      failures.push("sum path did not report SQL aggregation");
    }
  }

  return {
    testCase,
    response,
    trace,
    actualIntent,
    actualClarify,
    failures,
  };
}

async function runAllTests() {
  console.log("═".repeat(80));
  console.log("Assistant Router Regression Tests (deterministic)");
  console.log("═".repeat(80));

  const results = [];

  for (const testCase of TEST_CASES) {
    const result = await runTest(testCase);
    results.push(result);

    const status = result.failures.length === 0 ? "✓" : "✗";
    const expectedIntents = normalizeExpectedIntent(testCase.expectedIntent).join("|");
    console.log(`\n[${testCase.id}] ${testCase.description}`);
    console.log(`  Query: "${testCase.query}"`);
    console.log(`  Expected: intent=${expectedIntents}, clarify=${testCase.expectedClarification}`);
    console.log(`  Actual: intent=${result.actualIntent}, clarify=${formatClarify(result.actualClarify)}`);
    console.log(`  Handlers: search=${result.trace.executeSearch}, sum=${result.trace.executeSum}, rag=${result.trace.executeRAG}, qa=${result.trace.answerSingleDocumentQuestion}`);
    console.log(`  Result: ${status}${result.failures.length ? ` (${result.failures.join("; ")})` : ""}`);
  }

  const failed = results.filter((r) => r.failures.length > 0);
  const passed = results.length - failed.length;

  console.log("\n" + "═".repeat(80));
  console.log(`SUMMARY: ${passed}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("Failures:");
    for (const f of failed) {
      console.log(`  - [${f.testCase.id}] ${f.failures.join("; ")}`);
    }
  }
  console.log("═".repeat(80));
}

runAllTests().catch((error) => {
  console.error("Test run failed:", error);
  process.exit(1);
});
