#!/usr/bin/env npx tsx
/**
 * Comprehensive Assistant Test Suite
 *
 * Tests all intents: search, single_qa, sum, rag, clarify
 * Outputs structured results for engineering review.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { routeQuerySync, routeQuery } from "../lib/assistant/router";
import { executeSearch } from "../lib/assistant/search-handler";
import { executeSum, formatSumResult } from "../lib/assistant/sum-handler";
import { executeRAG, formatRAGResult } from "../lib/assistant/rag-handler";
import { answerSingleDocumentQuestion } from "../lib/assistant/single-qa";
import { handleAssistantQuery, createConversationContext } from "../lib/assistant/clarify";
import type { RouterResult, AssistantResponse } from "../lib/assistant/types";

interface TestCase {
  id: number;
  category: string;
  prompt: string;
  expectedIntent: string;
  description: string;
}

interface TestResult {
  id: number;
  category: string;
  prompt: string;
  expectedIntent: string;
  actualIntent: string;
  confidence: string;
  confidenceScore: number;
  needsClarify: boolean;
  slots: Record<string, unknown>;
  handler: string;
  resultType: string;
  resultSummary: string;
  citationCount?: number;
  citationsVerified?: boolean;
  sqlUsed?: boolean;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const TEST_CASES: TestCase[] = [
  // === SEARCH INTENT (8 tests) ===
  { id: 1, category: "search", prompt: "find all FedEx invoices", expectedIntent: "search", description: "Explicit search with vendor + type" },
  { id: 2, category: "search", prompt: "show me receipts from 2024", expectedIntent: "search", description: "Search with year filter" },
  { id: 3, category: "search", prompt: "list invoices over $500", expectedIntent: "search", description: "Search with amount comparison" },
  { id: 4, category: "search", prompt: "get Bega documents", expectedIntent: "search", description: "Search by vendor only" },
  { id: 5, category: "search", prompt: "invoices from January", expectedIntent: "search", description: "Search with month filter" },
  { id: 6, category: "search", prompt: "show all bank statements", expectedIntent: "search", description: "Search by document type" },
  { id: 7, category: "search", prompt: "find receipts under $100", expectedIntent: "search", description: "Search with less-than comparison" },
  { id: 8, category: "search", prompt: "documents from Centerpointe", expectedIntent: "search", description: "Search by vendor name" },

  // === SINGLE_QA INTENT (6 tests) ===
  { id: 9, category: "single_qa", prompt: "what's the total on the Centerpointe invoice?", expectedIntent: "single_qa", description: "Field query for specific doc" },
  { id: 10, category: "single_qa", prompt: "what is the vendor on the $105.50 invoice?", expectedIntent: "single_qa", description: "Query with amount identifier" },
  { id: 11, category: "single_qa", prompt: "when was the Bega invoice dated?", expectedIntent: "single_qa", description: "Date field query" },
  { id: 12, category: "single_qa", prompt: "what's the invoice number for FedEx?", expectedIntent: "single_qa", description: "Invoice number query" },
  { id: 13, category: "single_qa", prompt: "what's the total for the January 19 invoice?", expectedIntent: "single_qa", description: "Query with date identifier" },
  { id: 14, category: "single_qa", prompt: "who is the vendor for invoice #123?", expectedIntent: "single_qa", description: "Vendor query with invoice number" },

  // === SUM INTENT (6 tests) ===
  { id: 15, category: "sum", prompt: "what's the total for all invoices?", expectedIntent: "sum", description: "Sum all invoices" },
  { id: 16, category: "sum", prompt: "how much did we spend on Bega?", expectedIntent: "sum", description: "Sum by vendor" },
  { id: 17, category: "sum", prompt: "total for 2024 receipts", expectedIntent: "sum", description: "Sum with year filter" },
  { id: 18, category: "sum", prompt: "how many invoices do we have?", expectedIntent: "sum", description: "Count aggregation" },
  { id: 19, category: "sum", prompt: "what's the average invoice amount?", expectedIntent: "sum", description: "Average aggregation" },
  { id: 20, category: "sum", prompt: "sum all from Centerpointe", expectedIntent: "sum", description: "Sum with vendor from semantic" },

  // === RAG INTENT (5 tests) ===
  { id: 21, category: "rag", prompt: "tell me about our relationship with Bega", expectedIntent: "rag", description: "Relationship query" },
  { id: 22, category: "rag", prompt: "summarize all dealings with FedEx", expectedIntent: "rag", description: "Summary request" },
  { id: 23, category: "rag", prompt: "what vendors do we work with?", expectedIntent: "rag", description: "Overview question" },
  { id: 24, category: "rag", prompt: "analyze our spending patterns", expectedIntent: "rag", description: "Analysis request" },
  { id: 25, category: "rag", prompt: "give me an overview of 2024 invoices", expectedIntent: "rag", description: "Overview with year" },

  // === EDGE CASES (5 tests) ===
  { id: 26, category: "edge", prompt: "invoices", expectedIntent: "search", description: "Single word query" },
  { id: 27, category: "edge", prompt: "what is the total?", expectedIntent: "sum", description: "Ambiguous sum (needs clarify)" },
  { id: 28, category: "edge", prompt: "the Bega one", expectedIntent: "search", description: "Incomplete query" },
  { id: 29, category: "edge", prompt: "what's the total on the $500 Acme invoice from March 2024?", expectedIntent: "single_qa", description: "Complex multi-slot query" },
  { id: 30, category: "edge", prompt: "summarize", expectedIntent: "rag", description: "Minimal rag trigger" },
];

async function runTest(testCase: TestCase): Promise<TestResult> {
  const startTime = Date.now();
  let result: TestResult = {
    id: testCase.id,
    category: testCase.category,
    prompt: testCase.prompt,
    expectedIntent: testCase.expectedIntent,
    actualIntent: "",
    confidence: "",
    confidenceScore: 0,
    needsClarify: false,
    slots: {},
    handler: "",
    resultType: "",
    resultSummary: "",
    passed: false,
    durationMs: 0,
  };

  try {
    // Step 1: Route the query
    const routerResult = routeQuerySync(testCase.prompt);
    result.actualIntent = routerResult.intent;
    result.confidence = routerResult.confidence;
    result.confidenceScore = routerResult.confidenceScore;
    result.needsClarify = routerResult.needsClarification;
    result.slots = {
      documentType: routerResult.slots.documentType,
      vendor: routerResult.slots.vendor,
      year: routerResult.slots.year,
      amount: routerResult.slots.amount,
      aggregation: routerResult.slots.aggregation,
      comparison: routerResult.slots.comparison,
      comparisonValue: routerResult.slots.comparisonValue,
      field: routerResult.slots.field,
      semanticText: routerResult.slots.semanticText?.slice(0, 50),
    };

    // Check if intent matches expected
    const intentPassed = routerResult.intent === testCase.expectedIntent;

    // Step 2: Execute appropriate handler (if not needing clarification)
    if (!routerResult.needsClarification) {
      switch (routerResult.intent) {
        case "search": {
          result.handler = "executeSearch";
          const searchResult = await executeSearch(routerResult.slots);
          result.resultType = searchResult.success ? "success" : "error";
          result.resultSummary = `${searchResult.count} results`;
          result.sqlUsed = false;
          break;
        }
        case "single_qa": {
          result.handler = "answerSingleDocumentQuestion";
          const qaResult = await answerSingleDocumentQuestion(testCase.prompt, routerResult.slots);
          result.resultType = qaResult.error || "success";
          result.resultSummary = qaResult.answer?.slice(0, 80) || qaResult.clarifyingQuestion || "no answer";
          result.citationCount = qaResult.citations?.length || 0;
          result.citationsVerified = qaResult.allCitationsVerified;
          break;
        }
        case "sum": {
          result.handler = "executeSum";
          const sumResult = await executeSum(routerResult.slots);
          result.resultType = "success";
          result.resultSummary = `$${sumResult.total.toFixed(2)} from ${sumResult.count} docs`;
          result.sqlUsed = true;
          break;
        }
        case "rag": {
          result.handler = "executeRAG";
          const ragResult = await executeRAG(testCase.prompt, routerResult.slots);
          result.resultType = ragResult.confidence;
          result.resultSummary = ragResult.answer?.slice(0, 80) || "no answer";
          result.citationCount = ragResult.citations?.length || 0;
          break;
        }
      }
    } else {
      result.handler = "clarification_needed";
      result.resultType = "needs_clarify";
      result.resultSummary = routerResult.clarifyingQuestion || "clarification needed";
    }

    // Determine pass/fail
    result.passed = intentPassed;

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.resultType = "error";
    result.resultSummary = result.error;
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

async function runAllTests(): Promise<TestResult[]> {
  console.log("Starting comprehensive assistant test suite...\n");
  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    process.stdout.write(`[${testCase.id.toString().padStart(2, "0")}] ${testCase.prompt.slice(0, 50).padEnd(50)} `);
    const result = await runTest(testCase);
    results.push(result);

    const status = result.passed ? "✓" : "✗";
    const intentMatch = result.actualIntent === result.expectedIntent ? "" : ` (got: ${result.actualIntent})`;
    console.log(`${status} ${result.actualIntent}${intentMatch} [${result.durationMs}ms]`);
  }

  return results;
}

function generateReport(results: TestResult[]): void {
  console.log("\n" + "=".repeat(120));
  console.log("COMPREHENSIVE ASSISTANT TEST REPORT");
  console.log("=".repeat(120));

  // Section A: Entry Points & Call Graph
  console.log("\n## A. ENTRY POINTS & CALL GRAPH\n");
  console.log("```");
  console.log("User Input");
  console.log("    │");
  console.log("    ▼");
  console.log("scripts/assistant-cli.ts  →  handleAssistantQuery()  [REPL entry]");
  console.log("    │");
  console.log("    ▼");
  console.log("lib/assistant/clarify.ts");
  console.log("    ├── createConversationContext()");
  console.log("    ├── handleFollowUp()  [if pendingClarification]");
  console.log("    └── routeQuerySync()");
  console.log("            │");
  console.log("            ▼");
  console.log("lib/assistant/router.ts");
  console.log("    ├── parseQuery()  →  lib/search/parse-query.ts");
  console.log("    ├── matchRules()  →  lib/assistant/rules.ts");
  console.log("    └── classifyWithModel()  [fallback only]");
  console.log("            │");
  console.log("            ▼");
  console.log("Handler Dispatch (based on intent):");
  console.log("    ├── search    →  executeSearch()      →  smartSearch()  →  Supabase");
  console.log("    ├── single_qa →  answerSingleDocQuestion()  →  Gemini + citation verify");
  console.log("    ├── sum       →  executeSum()         →  Supabase SQL (accurate)");
  console.log("    └── rag       →  executeRAG()         →  smartSearch() + Gemini synthesis");
  console.log("```");

  // Section B: Test Matrix
  console.log("\n## B. TEST MATRIX\n");
  console.log("| ID | Category   | Prompt (truncated)                    | Expected | Actual   | Conf  | Clarify | Handler          | Result                        | Pass |");
  console.log("|----|------------|---------------------------------------|----------|----------|-------|---------|------------------|-------------------------------|------|");

  for (const r of results) {
    const prompt = r.prompt.slice(0, 37).padEnd(37);
    const expected = r.expectedIntent.padEnd(8);
    const actual = r.actualIntent.padEnd(8);
    const conf = `${(r.confidenceScore * 100).toFixed(0)}%`.padEnd(5);
    const clarify = r.needsClarify ? "Y" : "N";
    const handler = r.handler.slice(0, 16).padEnd(16);
    const resultSum = r.resultSummary.slice(0, 29).padEnd(29);
    const pass = r.passed ? "✓" : "✗";
    console.log(`| ${r.id.toString().padStart(2)} | ${r.category.padEnd(10)} | ${prompt} | ${expected} | ${actual} | ${conf} | ${clarify.padEnd(7)} | ${handler} | ${resultSum} | ${pass.padEnd(4)} |`);
  }

  // Section C: Failures & Fixes
  console.log("\n## C. FAILURES & RECOMMENDED FIXES\n");
  const failures = results.filter(r => !r.passed);
  if (failures.length === 0) {
    console.log("All tests passed.\n");
  } else {
    console.log(`${failures.length} test(s) failed:\n`);
    for (const f of failures) {
      console.log(`### Test ${f.id}: "${f.prompt}"`);
      console.log(`- Expected: ${f.expectedIntent}, Got: ${f.actualIntent}`);
      console.log(`- Confidence: ${(f.confidenceScore * 100).toFixed(0)}%`);
      console.log(`- Slots: ${JSON.stringify(f.slots)}`);
      if (f.error) console.log(`- Error: ${f.error}`);
      console.log(`- Root Cause: [INVESTIGATE]`);
      console.log(`- Fix Proposal: [TODO]\n`);
    }
  }

  // Section D: Summary Statistics
  console.log("\n## D. SUMMARY STATISTICS\n");
  const byCategory = new Map<string, { passed: number; total: number }>();
  for (const r of results) {
    const cat = byCategory.get(r.category) || { passed: 0, total: 0 };
    cat.total++;
    if (r.passed) cat.passed++;
    byCategory.set(r.category, cat);
  }

  console.log("| Category   | Passed | Total | Rate   |");
  console.log("|------------|--------|-------|--------|");
  for (const [cat, stats] of byCategory) {
    const rate = ((stats.passed / stats.total) * 100).toFixed(0) + "%";
    console.log(`| ${cat.padEnd(10)} | ${stats.passed.toString().padStart(6)} | ${stats.total.toString().padStart(5)} | ${rate.padStart(6)} |`);
  }

  const totalPassed = results.filter(r => r.passed).length;
  console.log(`| ${"TOTAL".padEnd(10)} | ${totalPassed.toString().padStart(6)} | ${results.length.toString().padStart(5)} | ${((totalPassed / results.length) * 100).toFixed(0) + "%".padStart(6)} |`);

  // Section E: Risk Assessment
  console.log("\n## E. TOP 5 RISKS BEFORE PRODUCTION\n");
  console.log("1. **Citation Verification Gaps** - Some citations may not verify against OCR text");
  console.log("   due to whitespace/punctuation differences. Consider fuzzy matching improvements.");
  console.log("");
  console.log("2. **Vendor Extraction from Semantic Text** - Sum handler extracts vendor from");
  console.log("   semanticText which may pick up noise words. More robust NER may be needed.");
  console.log("");
  console.log("3. **Ambiguous Queries Default to Search** - When rules don't match, router");
  console.log("   defaults to search which may not be user's intent. Consider asking for clarification.");
  console.log("");
  console.log("4. **RAG Totals Are Misleading** - RAG shows \"Amount in these docs\" but users");
  console.log("   may interpret it as accurate totals. Clear messaging required.");
  console.log("");
  console.log("5. **No Rate Limiting** - Gemini API calls in single_qa and rag handlers have");
  console.log("   no rate limiting. High traffic could hit quota limits.");

  // Section F: Clarification Flow Quality
  console.log("\n## F. CLARIFICATION TRIGGER ANALYSIS\n");
  const clarifyTests = results.filter(r => r.needsClarify);
  console.log(`${clarifyTests.length} of ${results.length} tests triggered clarification:\n`);
  for (const c of clarifyTests) {
    console.log(`- [${c.id}] "${c.prompt}" → ${c.resultSummary.slice(0, 60)}`);
  }

  // Section G: Performance
  console.log("\n## G. PERFORMANCE METRICS\n");
  const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
  const maxDuration = Math.max(...results.map(r => r.durationMs));
  const minDuration = Math.min(...results.map(r => r.durationMs));
  console.log(`- Average latency: ${avgDuration.toFixed(0)}ms`);
  console.log(`- Min latency: ${minDuration}ms`);
  console.log(`- Max latency: ${maxDuration}ms`);
  console.log(`- P95 would require more samples`);

  console.log("\n" + "=".repeat(120));
  console.log("END OF REPORT");
  console.log("=".repeat(120));
}

async function main() {
  const results = await runAllTests();
  generateReport(results);
}

main().catch(console.error);
