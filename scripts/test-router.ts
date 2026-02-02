#!/usr/bin/env npx tsx
/**
 * Test script for the Smart Assistant Router
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { routeQuery, routeQuerySync } from "../lib/assistant";

const TEST_QUERIES = [
  // Should match search intent with high confidence
  "find all FedEx invoices",

  // Should match sum intent
  "what is the total for 2024 receipts",

  // Should match search with comparison
  "show me invoices over $500",

  // Should match rag intent
  "tell me about our relationship with Bega",

  // Should need clarification (too vague)
  "invoice",

  // Should need clarification (no date range)
  "how much did we spend",

  // Additional test cases
  "how many receipts from January 2024",
  "what's the vendor for the $44 receipt",
  "list all bank statements",
  "summarize our dealings with CoolAir",
];

async function runTests() {
  console.log("═".repeat(70));
  console.log("Smart Assistant Router Test");
  console.log("═".repeat(70) + "\n");

  // First run sync tests (no model)
  console.log("━".repeat(70));
  console.log("SYNC MODE (rules only, no model fallback)");
  console.log("━".repeat(70) + "\n");

  for (const query of TEST_QUERIES) {
    const result = routeQuerySync(query);
    printResult(query, result);
  }

  // Then run async tests (with model fallback if needed)
  console.log("\n" + "━".repeat(70));
  console.log("ASYNC MODE (with Gemini model fallback)");
  console.log("━".repeat(70) + "\n");

  for (const query of TEST_QUERIES) {
    const result = await routeQuery(query);
    printResult(query, result);
  }
}

function printResult(query: string, result: ReturnType<typeof routeQuerySync>) {
  const confidenceIcon =
    result.confidence === "high" ? "🟢" :
    result.confidence === "medium" ? "🟡" : "🔴";

  const intentIcon =
    result.intent === "search" ? "🔍" :
    result.intent === "sum" ? "📊" :
    result.intent === "single_qa" ? "❓" : "📚";

  console.log(`Query: "${query}"`);
  console.log(`  ${intentIcon} Intent: ${result.intent} ${confidenceIcon} (${(result.confidenceScore * 100).toFixed(0)}%)`);

  // Show relevant slots
  const slotParts: string[] = [];
  if (result.slots.documentType) slotParts.push(`type=${result.slots.documentType}`);
  if (result.slots.vendor) slotParts.push(`vendor=${result.slots.vendor}`);
  if (result.slots.year) slotParts.push(`year=${result.slots.year}`);
  if (result.slots.amount) slotParts.push(`amount=$${result.slots.amount}`);
  if (result.slots.aggregation) slotParts.push(`agg=${result.slots.aggregation}`);
  if (result.slots.comparison) slotParts.push(`${result.slots.comparison} $${result.slots.comparisonValue}`);
  if (result.slots.semanticText && result.slots.semanticText.length > 0) {
    slotParts.push(`text="${result.slots.semanticText.slice(0, 30)}${result.slots.semanticText.length > 30 ? "..." : ""}"`);
  }
  if (slotParts.length > 0) {
    console.log(`  Slots: ${slotParts.join(", ")}`);
  }

  if (result.needsClarification) {
    console.log(`  ⚠️  Needs clarification: ${result.clarifyingQuestion}`);
  }

  if (result.usedModel) {
    console.log(`  🤖 Used Gemini model`);
  }

  console.log(`  Reasoning: ${result.reasoning}`);
  console.log();
}

runTests().catch(console.error);
