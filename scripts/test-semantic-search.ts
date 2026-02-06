#!/usr/bin/env npx tsx
/**
 * Semantic Search Test Script
 *
 * Tests both vector-only and hybrid search functionality:
 * 1. Embedding generation (verify 768 dimensions)
 * 2. Vector search with various queries
 * 3. Document type filtering
 * 4. Threshold filtering
 * 5. Similarity ranking
 * 6. Hybrid search (vector + keyword)
 * 7. Hybrid search weight adjustment
 *
 * Usage: npm run test:search
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { generateEmbedding } from "../lib/gemini/embeddings";
import { searchDocuments, hybridSearchDocuments } from "../lib/search/semantic-search";

function printSection(title: string) {
  console.log();
  console.log("=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

function printResult(label: string, success: boolean, details?: string) {
  const icon = success ? "✓" : "✗";
  console.log(`  ${icon} ${label}${details ? `: ${details}` : ""}`);
}

function printSkip(label: string, details?: string) {
  console.log(`  - ${label}${details ? `: ${details}` : ""} (skipped)`);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSortedDescending(values: number[]): boolean {
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) return false;
  }
  return true;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "have",
  "your",
  "you",
  "are",
  "was",
  "were",
  "invoice",
  "receipt",
  "statement",
  "document",
  "total",
  "amount",
  "date",
]);

function selectKeyword(rawText: string): string | null {
  const tokens = rawText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 5 && !STOP_WORDS.has(token));
  return tokens[0] ?? null;
}

async function testEmbeddingGeneration() {
  printSection("Test 1: Embedding Generation");

  const testText = "This is a sample invoice from Acme Corporation for consulting services.";

  console.log(`Testing embedding for: "${testText}"`);
  console.log();

  const result = await generateEmbedding(testText);

  if (!result.success) {
    printResult("Generate embedding", false, result.error);
    return false;
  }

  const dimensionCorrect = result.embedding.length === 768;
  const hasValidValues = result.embedding.every(
    (v) => typeof v === "number" && !isNaN(v) && isFinite(v)
  );

  printResult("Generate embedding", true, `${result.processingTimeMs}ms`);
  printResult("Dimension is 768", dimensionCorrect, `Got ${result.embedding.length}`);
  printResult("Values are valid numbers", hasValidValues);
  printResult("Text truncated", !result.truncated, result.truncated ? "Yes" : "No");

  // Show sample values
  console.log();
  console.log("  Sample embedding values (first 5):");
  console.log(`    [${result.embedding.slice(0, 5).map((v) => v.toFixed(6)).join(", ")}, ...]`);

  return dimensionCorrect && hasValidValues;
}

async function testSearchQueries() {
  printSection("Test 2: Vector Search Queries");

  const testQueries = [
    { query: "invoice from Acme", description: "Vendor-specific invoice search" },
    { query: "bank statement January", description: "Bank statement with date" },
    { query: "lease agreement San Francisco", description: "Contract with location" },
    { query: "tax form 2023", description: "Tax form with year" },
    { query: "receipt for office supplies", description: "Receipt category search" },
  ];

  let allPassed = true;

  for (const { query, description } of testQueries) {
    console.log();
    console.log(`  Query: "${query}" (${description})`);

    const result = await searchDocuments(query, { limit: 5, threshold: 0.5 });

    if (!result.success) {
      printResult("Search executed", false, result.error);
      allPassed = false;
      continue;
    }

    printResult(
      "Search executed",
      true,
      `${result.results.length} results in ${result.processingTimeMs}ms`
    );

    if (result.results.length > 0) {
      console.log("    Top results:");
      for (const r of result.results.slice(0, 3)) {
        console.log(
          `      - ${r.fileName} (${r.documentType || "unknown"}) - similarity: ${(r.similarity * 100).toFixed(1)}%`
        );
      }
    } else {
      console.log("    No results found (this may be expected if database is empty)");
    }
  }

  return allPassed;
}

async function testDocumentTypeFilter() {
  printSection("Test 3: Document Type Filter");

  const query = "financial document";

  console.log(`  Query: "${query}" with type filter`);
  console.log();

  // Test with invoice filter
  const invoiceResult = await searchDocuments(query, {
    limit: 5,
    threshold: 0.3,
    documentType: "invoice",
  });

  if (!invoiceResult.success) {
    printResult("Filter by invoice", false, invoiceResult.error);
    return false;
  }

  printResult(
    "Filter by invoice",
    true,
    `${invoiceResult.results.length} results`
  );

  // Verify all results are invoices
  const allInvoices = invoiceResult.results.every(
    (r) => r.documentType === "invoice" || r.documentType === null
  );
  printResult("All results are invoices", allInvoices || invoiceResult.results.length === 0);

  // Test with receipt filter
  const receiptResult = await searchDocuments(query, {
    limit: 5,
    threshold: 0.3,
    documentType: "receipt",
  });

  if (!receiptResult.success) {
    printResult("Filter by receipt", false, receiptResult.error);
    return false;
  }

  printResult(
    "Filter by receipt",
    true,
    `${receiptResult.results.length} results`
  );

  return true;
}

async function testThresholdFiltering() {
  printSection("Test 4: Threshold Filtering");

  const query = "document";

  // Low threshold (0.3)
  const lowThreshold = await searchDocuments(query, {
    limit: 20,
    threshold: 0.3,
  });

  // High threshold (0.8)
  const highThreshold = await searchDocuments(query, {
    limit: 20,
    threshold: 0.8,
  });

  if (!lowThreshold.success || !highThreshold.success) {
    printResult("Threshold comparison", false, "Search failed");
    return false;
  }

  const lowCount = lowThreshold.results.length;
  const highCount = highThreshold.results.length;

  printResult(
    "Low threshold (0.3)",
    true,
    `${lowCount} results`
  );
  printResult(
    "High threshold (0.8)",
    true,
    `${highCount} results`
  );

  // With valid data, low threshold should return >= high threshold results
  const logicalOrder = lowCount >= highCount;
  printResult(
    "Low threshold >= high threshold results",
    logicalOrder || (lowCount === 0 && highCount === 0),
    `${lowCount} >= ${highCount}`
  );

  return true;
}

async function testSimilarityRanking() {
  printSection("Test 5: Similarity Ranking");

  const query = "invoice payment due";

  const result = await searchDocuments(query, {
    limit: 10,
    threshold: 0.3,
  });

  if (!result.success) {
    printResult("Search for ranking test", false, result.error);
    return false;
  }

  printResult("Search executed", true, `${result.results.length} results`);

  if (result.results.length < 2) {
    console.log("    Not enough results to verify ranking (need at least 2)");
    return true;
  }

  // Check that results are ordered by similarity (descending)
  let isOrdered = true;
  for (let i = 1; i < result.results.length; i++) {
    if (result.results[i].similarity > result.results[i - 1].similarity) {
      isOrdered = false;
      break;
    }
  }

  printResult("Results ordered by similarity (descending)", isOrdered);

  if (result.results.length > 0) {
    console.log("    Similarity scores:");
    for (const r of result.results.slice(0, 5)) {
      console.log(`      - ${r.fileName}: ${(r.similarity * 100).toFixed(2)}%`);
    }
  }

  return isOrdered;
}

async function testHybridSearch() {
  printSection("Test 6: Hybrid Search (Vector + Keyword)");

  const testQueries = [
    { query: "invoice", description: "Exact keyword match" },
    { query: "payment document", description: "Semantic search" },
    { query: "HVAC services invoice", description: "Combined keyword + semantic" },
  ];

  let allPassed = true;

  for (const { query, description } of testQueries) {
    console.log();
    console.log(`  Query: "${query}" (${description})`);

    const result = await hybridSearchDocuments(query, {
      limit: 5,
      minScore: 0.2,
    });

    if (!result.success) {
      printResult("Hybrid search executed", false, result.error);
      allPassed = false;
      continue;
    }

    printResult(
      "Hybrid search executed",
      true,
      `${result.results.length} results in ${result.processingTimeMs}ms`
    );

    if (result.results.length > 0) {
      console.log("    Top results (score = vector + keyword):");
      for (const r of result.results.slice(0, 3)) {
        console.log(
          `      - ${r.fileName} | score: ${(r.score * 100).toFixed(1)}% (vec: ${(r.vectorScore * 100).toFixed(1)}%, kw: ${(r.keywordScore * 100).toFixed(1)}%)`
        );
      }
    } else {
      console.log("    No results found");
    }
  }

  return allPassed;
}

async function testHybridWeightAdjustment() {
  printSection("Test 7: Hybrid Search Weight Adjustment");

  const query = "invoice services";

  console.log(`  Query: "${query}"`);
  console.log();

  // Test with default weights (0.7 vector, 0.3 keyword)
  const defaultWeights = await hybridSearchDocuments(query, {
    limit: 5,
    minScore: 0.2,
    vectorWeight: 0.7,
    keywordWeight: 0.3,
  });

  if (!defaultWeights.success) {
    printResult("Default weights (0.7/0.3)", false, defaultWeights.error);
    return false;
  }

  printResult(
    "Default weights (0.7 vec / 0.3 kw)",
    true,
    `${defaultWeights.results.length} results`
  );

  // Test with equal weights (0.5 vector, 0.5 keyword)
  const equalWeights = await hybridSearchDocuments(query, {
    limit: 5,
    minScore: 0.2,
    vectorWeight: 0.5,
    keywordWeight: 0.5,
  });

  if (!equalWeights.success) {
    printResult("Equal weights (0.5/0.5)", false, equalWeights.error);
    return false;
  }

  printResult(
    "Equal weights (0.5 vec / 0.5 kw)",
    true,
    `${equalWeights.results.length} results`
  );

  // Test with keyword-heavy weights (0.3 vector, 0.7 keyword)
  const keywordHeavy = await hybridSearchDocuments(query, {
    limit: 5,
    minScore: 0.2,
    vectorWeight: 0.3,
    keywordWeight: 0.7,
  });

  if (!keywordHeavy.success) {
    printResult("Keyword-heavy (0.3/0.7)", false, keywordHeavy.error);
    return false;
  }

  printResult(
    "Keyword-heavy (0.3 vec / 0.7 kw)",
    true,
    `${keywordHeavy.results.length} results`
  );

  // Show comparison
  console.log();
  console.log("  Score comparison for top result:");

  if (defaultWeights.results.length > 0) {
    const r = defaultWeights.results[0];
    console.log(`    Default:  ${r.fileName} - ${(r.score * 100).toFixed(1)}%`);
  }
  if (equalWeights.results.length > 0) {
    const r = equalWeights.results[0];
    console.log(`    Equal:    ${r.fileName} - ${(r.score * 100).toFixed(1)}%`);
  }
  if (keywordHeavy.results.length > 0) {
    const r = keywordHeavy.results[0];
    console.log(`    Kw-heavy: ${r.fileName} - ${(r.score * 100).toFixed(1)}%`);
  }

  return true;
}

async function testHybridVsVectorComparison() {
  printSection("Test 8: Hybrid vs Vector-Only Comparison");

  const query = "CoolAir HVAC";

  console.log(`  Query: "${query}" (contains exact terms)`);
  console.log();

  // Vector-only search
  const vectorResult = await searchDocuments(query, {
    limit: 5,
    threshold: 0.3,
  });

  // Hybrid search
  const hybridResult = await hybridSearchDocuments(query, {
    limit: 5,
    minScore: 0.2,
  });

  if (!vectorResult.success || !hybridResult.success) {
    printResult("Comparison test", false, "Search failed");
    return false;
  }

  printResult("Vector-only search", true, `${vectorResult.results.length} results`);
  printResult("Hybrid search", true, `${hybridResult.results.length} results`);

  console.log();
  console.log("  Vector-only results:");
  for (const r of vectorResult.results.slice(0, 3)) {
    console.log(`    - ${r.fileName}: ${(r.similarity * 100).toFixed(1)}%`);
  }

  console.log();
  console.log("  Hybrid results:");
  for (const r of hybridResult.results.slice(0, 3)) {
    console.log(
      `    - ${r.fileName}: ${(r.score * 100).toFixed(1)}% (vec: ${(r.vectorScore * 100).toFixed(1)}%, kw: ${(r.keywordScore * 100).toFixed(1)}%)`
    );
  }

  // Check if hybrid search boosted documents with keyword matches
  const hybridHasKeywordBoost = hybridResult.results.some(r => r.keywordScore > 0);
  printResult(
    "Hybrid search shows keyword boost",
    hybridHasKeywordBoost || hybridResult.results.length === 0,
    hybridHasKeywordBoost ? "Yes" : "No keyword matches found"
  );

  return true;
}

async function testResultInvariants() {
  printSection("Test 9: Result Invariants");

  const query = "invoice";
  const limit = 3;

  const result = await searchDocuments(query, {
    limit,
    threshold: 0.3,
  });

  if (!result.success) {
    printResult("Search executed", false, result.error);
    return false;
  }

  printResult(
    "Search executed",
    true,
    `${result.results.length} results in ${result.processingTimeMs}ms`
  );

  if (result.results.length === 0) {
    printSkip("Result invariants", "no results");
    return true;
  }

  const limitOk = result.results.length <= limit;
  printResult("Respects limit", limitOk, `${result.results.length} <= ${limit}`);

  const requiredFieldsOk = result.results.every((r) => r.id && r.fileName);
  printResult("Required fields present", requiredFieldsOk);

  const similarityBoundsOk = result.results.every(
    (r) => isFiniteNumber(r.similarity) && r.similarity >= 0 && r.similarity <= 1
  );
  printResult("Similarity within [0,1]", similarityBoundsOk);

  const createdAtOk = result.results.every((r) => !Number.isNaN(Date.parse(r.createdAt)));
  printResult("createdAt is parseable", createdAtOk);

  return limitOk && requiredFieldsOk && similarityBoundsOk && createdAtOk;
}

async function testHybridScoreBounds() {
  printSection("Test 10: Hybrid Score Bounds");

  const query = "invoice";
  const result = await hybridSearchDocuments(query, {
    limit: 5,
    minScore: 0.1,
  });

  if (!result.success) {
    printResult("Hybrid search executed", false, result.error);
    return false;
  }

  printResult(
    "Hybrid search executed",
    true,
    `${result.results.length} results in ${result.processingTimeMs}ms`
  );

  if (result.results.length === 0) {
    printSkip("Hybrid score bounds", "no results");
    return true;
  }

  const scoreBoundsOk = result.results.every(
    (r) =>
      isFiniteNumber(r.score) &&
      isFiniteNumber(r.vectorScore) &&
      isFiniteNumber(r.keywordScore) &&
      r.score >= 0 &&
      r.score <= 1 &&
      r.vectorScore >= 0 &&
      r.vectorScore <= 1 &&
      r.keywordScore >= 0 &&
      r.keywordScore <= 1
  );

  printResult("Scores within [0,1]", scoreBoundsOk);
  return scoreBoundsOk;
}

async function testHybridOrdering() {
  printSection("Test 11: Hybrid Ordering");

  const result = await hybridSearchDocuments("invoice", {
    limit: 10,
    minScore: 0.2,
  });

  if (!result.success) {
    printResult("Hybrid search executed", false, result.error);
    return false;
  }

  printResult(
    "Hybrid search executed",
    true,
    `${result.results.length} results in ${result.processingTimeMs}ms`
  );

  if (result.results.length < 2) {
    printSkip("Hybrid ordering", "not enough results");
    return true;
  }

  const scores = result.results.map((r) => r.score);
  const ordered = isSortedDescending(scores);
  printResult("Results ordered by score (descending)", ordered);
  return ordered;
}

async function testHybridScoreFormula() {
  printSection("Test 12: Hybrid Score Formula");

  const vectorWeight = 0.6;
  const keywordWeight = 0.4;
  const epsilon = 1e-3;

  const result = await hybridSearchDocuments("invoice", {
    limit: 10,
    minScore: 0.1,
    vectorWeight,
    keywordWeight,
  });

  if (!result.success) {
    printResult("Hybrid search executed", false, result.error);
    return false;
  }

  printResult(
    "Hybrid search executed",
    true,
    `${result.results.length} results in ${result.processingTimeMs}ms`
  );

  if (result.results.length === 0) {
    printSkip("Score formula", "no results");
    return true;
  }

  const formulaOk = result.results.every((r) => {
    const expected = r.vectorScore * vectorWeight + r.keywordScore * keywordWeight;
    return Math.abs(r.score - expected) <= epsilon;
  });

  printResult("Score matches weighted sum", formulaOk, `epsilon=${epsilon}`);
  return formulaOk;
}

async function testHybridKeywordBoostFromResult() {
  printSection("Test 13: Keyword Boost From Result Text");

  const seed = await searchDocuments("invoice", {
    limit: 5,
    threshold: 0.1,
  });

  if (!seed.success) {
    printResult("Seed vector search executed", false, seed.error);
    return false;
  }

  const candidate = seed.results.find((r) => typeof r.rawText === "string" && r.rawText.length > 0);
  if (!candidate || !candidate.rawText) {
    printSkip("Keyword boost", "no raw text available");
    return true;
  }

  const keyword = selectKeyword(candidate.rawText);
  if (!keyword) {
    printSkip("Keyword boost", "no suitable keyword found");
    return true;
  }

  console.log(`  Using keyword: "${keyword}"`);

  const result = await hybridSearchDocuments(keyword, {
    limit: 10,
    minScore: 0.1,
  });

  if (!result.success) {
    printResult("Hybrid search executed", false, result.error);
    return false;
  }

  const matched = result.results.find((r) => r.id === candidate.id);
  if (!matched) {
    printSkip("Keyword boost", "seed doc not returned for keyword search");
    return true;
  }

  const boosted = matched.keywordScore > 0;
  printResult("Seed doc has keyword score > 0", boosted);
  return boosted;
}

async function testErrorHandling() {
  printSection("Test 14: Error Handling");

  const emptyQuery = "   ";
  const vectorEmpty = await searchDocuments(emptyQuery);
  printResult("Vector search rejects empty query", !vectorEmpty.success);

  const hybridEmpty = await hybridSearchDocuments(emptyQuery);
  printResult("Hybrid search rejects empty query", !hybridEmpty.success);

  const hybridBadWeights = await hybridSearchDocuments("invoice", {
    vectorWeight: -0.1,
    keywordWeight: 1.1,
  });
  printResult("Hybrid search rejects invalid weights", !hybridBadWeights.success);

  return !vectorEmpty.success && !hybridEmpty.success && !hybridBadWeights.success;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Semantic & Hybrid Search Test Suite");
  console.log("=".repeat(60));

  const results: Array<{ test: string; passed: boolean }> = [];

  try {
    // Test 1: Embedding generation
    const test1 = await testEmbeddingGeneration();
    results.push({ test: "Embedding Generation", passed: test1 });

    // Test 2: Vector search queries
    const test2 = await testSearchQueries();
    results.push({ test: "Vector Search Queries", passed: test2 });

    // Test 3: Document type filter
    const test3 = await testDocumentTypeFilter();
    results.push({ test: "Document Type Filter", passed: test3 });

    // Test 4: Threshold filtering
    const test4 = await testThresholdFiltering();
    results.push({ test: "Threshold Filtering", passed: test4 });

    // Test 5: Similarity ranking
    const test5 = await testSimilarityRanking();
    results.push({ test: "Similarity Ranking", passed: test5 });

    // Test 6: Hybrid search
    const test6 = await testHybridSearch();
    results.push({ test: "Hybrid Search", passed: test6 });

    // Test 7: Hybrid weight adjustment
    const test7 = await testHybridWeightAdjustment();
    results.push({ test: "Hybrid Weight Adjustment", passed: test7 });

    // Test 8: Hybrid vs vector comparison
    const test8 = await testHybridVsVectorComparison();
    results.push({ test: "Hybrid vs Vector Comparison", passed: test8 });

    // Test 9: Result invariants
    const test9 = await testResultInvariants();
    results.push({ test: "Result Invariants", passed: test9 });

    // Test 10: Hybrid score bounds
    const test10 = await testHybridScoreBounds();
    results.push({ test: "Hybrid Score Bounds", passed: test10 });

    // Test 11: Hybrid ordering
    const test11 = await testHybridOrdering();
    results.push({ test: "Hybrid Ordering", passed: test11 });

    // Test 12: Hybrid score formula
    const test12 = await testHybridScoreFormula();
    results.push({ test: "Hybrid Score Formula", passed: test12 });

    // Test 13: Hybrid keyword boost
    const test13 = await testHybridKeywordBoostFromResult();
    results.push({ test: "Hybrid Keyword Boost", passed: test13 });

    // Test 14: Error handling
    const test14 = await testErrorHandling();
    results.push({ test: "Error Handling", passed: test14 });
  } catch (error) {
    console.error();
    console.error("Fatal error during tests:", error);
  }

  // Summary
  printSection("Test Summary");

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  for (const { test, passed } of results) {
    printResult(test, passed);
  }

  console.log();
  console.log(`Total: ${passed}/${total} tests passed`);

  if (passed < total) {
    console.log();
    console.log("Note: Some tests may fail if the database is empty or");
    console.log("if documents haven't been processed with embeddings yet.");
    console.log("Run 'npm run embeddings:backfill' to generate embeddings.");
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
