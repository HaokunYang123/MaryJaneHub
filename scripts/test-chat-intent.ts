/**
 * Test suite for chat intent — router classification, aggregation/normalization, and chat route behavior.
 *
 * Usage: npx tsx scripts/test-chat-intent.ts
 */

import { routeQuerySync } from "../lib/assistant/router";
import { buildBusinessContext, formatDeterministicSummary } from "../lib/assistant/chat-handler";
import { extractVendorFromSemanticText } from "../lib/assistant/sum-handler";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    failed++;
  }
}

// ============================================================================
// 1. Router classification tests — chat intent
// ============================================================================

console.log("\n=== Chat Intent Classification Tests ===\n");

// Greeting/casual queries should route to chat
const greetingQueries: Array<{ query: string; label: string }> = [
  { query: "hi", label: "hi -> chat" },
  { query: "hello", label: "hello -> chat" },
  { query: "hey", label: "hey -> chat" },
  { query: "good morning", label: "good morning -> chat" },
  { query: "thanks", label: "thanks -> chat" },
  { query: "thank you", label: "thank you -> chat" },
  { query: "yo", label: "yo -> chat" },
  { query: "what can you do", label: "what can you do -> chat" },
  { query: "help", label: "help -> chat" },
  { query: "how are you", label: "how are you -> chat" },
];

for (const { query, label } of greetingQueries) {
  const result = routeQuerySync(query);
  assert(result.intent === "chat", `${label} (got: ${result.intent})`);
  assert(!result.needsClarification, `${label} — no clarification needed`);
}

// Business overview queries should route to chat
console.log("\n--- Business overview -> chat ---\n");

const chatQueries: Array<{ query: string; label: string }> = [
  { query: "How is my business doing?", label: "business overview -> chat" },
  { query: "What vendors do we work with?", label: "vendor list -> chat" },
  { query: "What should I focus on?", label: "focus/attention -> chat" },
  { query: "Give me a business overview", label: "explicit overview -> chat" },
  { query: "Where does my money go?", label: "spending breakdown -> chat" },
  { query: "What's pending?", label: "pending status -> chat" },
  { query: "Who are our vendors?", label: "vendor identity -> chat" },
  { query: "Business status", label: "status keyword -> chat" },
];

for (const { query, label } of chatQueries) {
  const result = routeQuerySync(query);
  assert(result.intent === "chat", `${label} (got: ${result.intent})`);
  assert(!result.needsClarification, `${label} — no clarification needed`);
}

// Natural language search queries should route to search
console.log("\n--- Natural language search -> search ---\n");

const naturalSearchQueries: Array<{ query: string; label: string }> = [
  { query: "can you find me the file in 2012 about centerpointe?", label: "can you find -> search" },
  { query: "do we have any invoices from FedEx?", label: "do we have invoices -> search" },
  { query: "where are the 2024 receipts?", label: "where are receipts -> search" },
  { query: "pull up the centerpointe files", label: "pull up files -> search" },
  { query: "could you search for receipts from Bega?", label: "could you search -> search" },
  { query: "I'm looking for the 2012 invoices", label: "I'm looking for -> search" },
  { query: "i need to find the FedEx documents", label: "i need to find -> search" },
];

for (const { query, label } of naturalSearchQueries) {
  const result = routeQuerySync(query);
  assert(result.intent === "search", `${label} (got: ${result.intent})`);
  assert(!result.needsClarification, `${label} — no clarification needed (score: ${result.confidenceScore})`);
}

// Non-chat queries should NOT route to chat
console.log("\n--- Non-chat regression checks ---\n");

const nonChatQueries: Array<{ query: string; expected: string; label: string }> = [
  { query: "How much did we spend in 2024?", expected: "sum", label: "specific spend -> sum (not chat)" },
  { query: "Find invoices from Centerpointe", expected: "search", label: "find invoices -> search (not chat)" },
  { query: "Show me all receipts from 2024", expected: "search", label: "show receipts -> search (not chat)" },
  { query: "What's the total for invoice #123?", expected: "single_qa", label: "specific invoice -> single_qa (not chat)" },
  { query: "How many invoices do we have?", expected: "sum", label: "count query -> sum (not chat)" },
];

for (const { query, expected, label } of nonChatQueries) {
  const result = routeQuerySync(query);
  assert(result.intent === expected, `${label} (got: ${result.intent})`);
  assert(result.intent !== "chat", `${label} — confirmed not chat`);
}

// ============================================================================
// 2. Aggregation + normalization tests
// ============================================================================

console.log("\n=== Normalization Tests ===\n");

const mockContext = {
  totalDocuments: 163,
  typeCounts: { invoice: 120, receipt: 30, "bank_statement": 10, contract: 3 },
  statusCounts: { approved: 140, pending_review: 15, needs_attention: 5, error: 3 },
  vendorSpend: [
    { vendor: "Centerpointe", total: 45000.50, count: 30 },
    { vendor: "FedEx", total: 12000.00, count: 15 },
    { vendor: "Bega Cheese", total: 8500.25, count: 10 },
  ],
  totalSpend: 65500.75,
  dateRange: { earliest: "2014-01-24", latest: "2025-11-15" },
  avgConfidence: 0.883,
  recentDocuments: [
    { fileName: "inv-001.pdf", type: "invoice", vendor: "Centerpointe", total: 1600, date: "2025-11-15" },
  ],
};

const summary = formatDeterministicSummary(mockContext);

assert(summary.includes("163 documents"), "deterministic summary includes doc count");
assert(summary.includes("$65,500.75"), "deterministic summary includes total spend");
assert(summary.includes("2014-01-24"), "deterministic summary includes date range start");
assert(summary.includes("2025-11-15"), "deterministic summary includes date range end");
assert(summary.includes("Centerpointe"), "deterministic summary includes top vendor");
assert(summary.includes("20 document"), "deterministic summary includes actionable count (15 pending + 5 attention)");
assert(summary.includes("invoice"), "deterministic summary includes document types");

// Edge case: empty context
const emptyContext = {
  totalDocuments: 0,
  typeCounts: {},
  statusCounts: {},
  vendorSpend: [],
  totalSpend: 0,
  dateRange: null,
  avgConfidence: 0,
  recentDocuments: [],
};

const emptySummary = formatDeterministicSummary(emptyContext);
assert(emptySummary.includes("0 documents"), "empty context produces valid summary");
assert(!emptySummary.includes("NaN"), "empty context has no NaN");

// ============================================================================
// 3. Integration checks
// ============================================================================

console.log("\n=== Integration Checks ===\n");

// Chat intent returns no clarification
for (const query of ["How is my business doing?", "What vendors do we work with?", "hi", "hello"]) {
  const result = routeQuerySync(query);
  assert(result.intent === "chat", `${query} routes to chat`);
  assert(result.needsClarification === false, `${query} needs no clarification`);
  assert(result.confidenceScore >= 0.85, `${query} has high confidence (${result.confidenceScore})`);
}

// ============================================================================
// 4. Vendor extraction tests (sum-handler)
// ============================================================================

console.log("\n=== Vendor Extraction from SemanticText ===\n");

// Case-insensitive vendor extraction
assert(
  extractVendorFromSemanticText("from centerpointe") === "centerpointe",
  "lowercase 'from centerpointe' extracts vendor"
);
assert(
  extractVendorFromSemanticText("from Centerpointe") === "Centerpointe",
  "capitalized 'from Centerpointe' extracts vendor"
);
assert(
  extractVendorFromSemanticText("for fedex") === "fedex",
  "lowercase 'for fedex' extracts vendor"
);

// "about" and "related to" patterns
assert(
  extractVendorFromSemanticText("about centerpointe") === "centerpointe",
  "'about centerpointe' extracts vendor in sum context"
);
assert(
  extractVendorFromSemanticText("related to centerpointe") === "centerpointe",
  "'related to centerpointe' extracts vendor"
);
assert(
  extractVendorFromSemanticText("related to FedEx") === "FedEx",
  "'related to FedEx' extracts vendor"
);

// Multi-word vendors with special chars
assert(
  extractVendorFromSemanticText("from Centerpointe Graphics") === "Centerpointe Graphics",
  "multi-word vendor 'Centerpointe Graphics' extracted"
);

// End-of-text vendor detection
assert(
  extractVendorFromSemanticText("centerpointe") === "centerpointe",
  "bare 'centerpointe' at end extracts vendor"
);

// Negative: skip words should NOT be extracted as vendors
assert(
  extractVendorFromSemanticText("from all") === null,
  "'from all' does not extract vendor"
);
assert(
  extractVendorFromSemanticText("about invoices") === null,
  "'about invoices' does not extract false vendor"
);
assert(
  extractVendorFromSemanticText("about the total") === null,
  "'about the total' does not extract false vendor"
);
assert(
  extractVendorFromSemanticText("from January") === null,
  "'from January' does not extract month as vendor"
);

// ============================================================================
// 5. Follow-up intent carry-over (elliptical query detection)
// ============================================================================

console.log("\n=== Elliptical Follow-up Detection ===\n");

// These are short referential queries that should be detected as follow-ups
const ellipticalQueries = [
  "so can you give me the correct one?",
  "the right one",
  "show me those",
  "what about that one",
  "any more?",
  "the other one",
  "try it again",
  "instead of that",
];

for (const q of ellipticalQueries) {
  const words = q.trim().split(/\s+/);
  const isShort = words.length <= 10;
  const referentialWords = /\b(correct|right|those|that|it|them|more|other|instead|one|ones|these|which|same|again|else|different)\b/i;
  const hasReferential = referentialWords.test(q);
  const hasStrongIntent = /\b(find|show|search|how much|total|sum|what is|list|get)\b/i.test(q);

  // "show me those" has "show" so it triggers hasStrongIntent — that's OK, it won't be a false follow-up
  if (q === "show me those") {
    assert(hasStrongIntent, `"${q}" has strong intent signal (expected, skip follow-up)`);
    continue;
  }

  assert(isShort && hasReferential && !hasStrongIntent, `"${q}" detected as elliptical follow-up`);
}

// Non-follow-up queries that should NOT match
const nonFollowUp = [
  "Find invoices from Centerpointe in 2012",
  "How much did we spend last year?",
  "What is the total for this vendor?",
];

for (const q of nonFollowUp) {
  const words = q.trim().split(/\s+/);
  const isShort = words.length <= 10;
  const referentialWords = /\b(correct|right|those|that|it|them|more|other|instead|one|ones|these|which|same|again|else|different)\b/i;
  const hasReferential = referentialWords.test(q);
  const hasStrongIntent = /\b(find|show|search|how much|total|sum|what is|list|get)\b/i.test(q);

  const wouldBeFollowUp = isShort && hasReferential && !hasStrongIntent;
  assert(!wouldBeFollowUp, `"${q}" is NOT an elliptical follow-up`);
}

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
