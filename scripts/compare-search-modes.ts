#!/usr/bin/env npx tsx
/**
 * Search Mode Comparison Script
 *
 * Runs the same queries through both vector-only and hybrid search
 * and displays side-by-side comparison of rankings and scores.
 *
 * Usage: npm run test:search:compare
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { searchDocuments, hybridSearchDocuments } from "../lib/search/semantic-search";

interface ComparisonResult {
  query: string;
  vectorResults: Array<{ fileName: string; score: number }>;
  hybridResults: Array<{ fileName: string; score: number; vectorScore: number; keywordScore: number }>;
  vectorTimeMs: number;
  hybridTimeMs: number;
}

async function compareSearchModes(query: string): Promise<ComparisonResult> {
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

  return {
    query,
    vectorResults: vectorResult.success
      ? vectorResult.results.map((r) => ({
          fileName: r.fileName,
          score: r.similarity,
        }))
      : [],
    hybridResults: hybridResult.success
      ? hybridResult.results.map((r) => ({
          fileName: r.fileName,
          score: r.score,
          vectorScore: r.vectorScore,
          keywordScore: r.keywordScore,
        }))
      : [],
    vectorTimeMs: vectorResult.success ? vectorResult.processingTimeMs : 0,
    hybridTimeMs: hybridResult.success ? hybridResult.processingTimeMs : 0,
  };
}

function printComparison(result: ComparisonResult) {
  console.log();
  console.log("─".repeat(80));
  console.log(`Query: "${result.query}"`);
  console.log("─".repeat(80));
  console.log();

  // Calculate column widths
  const fileNameWidth = 45;
  const scoreWidth = 12;

  // Print header
  console.log(
    "  " +
      "Vector-Only".padEnd(fileNameWidth + scoreWidth) +
      " │ " +
      "Hybrid (Vector + Keyword)"
  );
  console.log(
    "  " +
      "─".repeat(fileNameWidth + scoreWidth) +
      "─┼─" +
      "─".repeat(fileNameWidth + scoreWidth + 10)
  );

  // Print results side by side
  const maxRows = Math.max(result.vectorResults.length, result.hybridResults.length);

  for (let i = 0; i < maxRows; i++) {
    const vectorRow = result.vectorResults[i];
    const hybridRow = result.hybridResults[i];

    let vectorCol = "";
    if (vectorRow) {
      const fileName = vectorRow.fileName.length > fileNameWidth - 3
        ? vectorRow.fileName.substring(0, fileNameWidth - 6) + "..."
        : vectorRow.fileName;
      vectorCol = `${(i + 1)}. ${fileName.padEnd(fileNameWidth - 3)}${(vectorRow.score * 100).toFixed(1).padStart(scoreWidth - 1)}%`;
    } else {
      vectorCol = " ".repeat(fileNameWidth + scoreWidth);
    }

    let hybridCol = "";
    if (hybridRow) {
      const fileName = hybridRow.fileName.length > fileNameWidth - 3
        ? hybridRow.fileName.substring(0, fileNameWidth - 6) + "..."
        : hybridRow.fileName;
      const scoreBreakdown = `(v:${(hybridRow.vectorScore * 100).toFixed(0)}% k:${(hybridRow.keywordScore * 100).toFixed(0)}%)`;
      hybridCol = `${(i + 1)}. ${fileName.padEnd(fileNameWidth - 3)}${(hybridRow.score * 100).toFixed(1).padStart(scoreWidth - 1)}% ${scoreBreakdown}`;
    }

    console.log(`  ${vectorCol} │ ${hybridCol}`);
  }

  if (maxRows === 0) {
    console.log("  (no results)".padEnd(fileNameWidth + scoreWidth) + " │ (no results)");
  }

  console.log();
  console.log(`  Time: Vector ${result.vectorTimeMs}ms │ Hybrid ${result.hybridTimeMs}ms`);

  // Analysis
  if (result.hybridResults.length > 0) {
    const hasKeywordBoost = result.hybridResults.some((r) => r.keywordScore > 0);
    if (hasKeywordBoost) {
      console.log("  Analysis: Keyword matches found - hybrid search boosted relevant documents");
    } else {
      console.log("  Analysis: No keyword matches - results based on semantic similarity only");
    }

    // Check if rankings differ
    if (result.vectorResults.length > 0 && result.hybridResults.length > 0) {
      const vectorTop = result.vectorResults[0].fileName;
      const hybridTop = result.hybridResults[0].fileName;
      if (vectorTop !== hybridTop) {
        console.log(`  Note: Different top result! Vector: ${vectorTop}, Hybrid: ${hybridTop}`);
      }
    }
  }
}

async function main() {
  console.log("═".repeat(80));
  console.log("Search Mode Comparison: Vector-Only vs Hybrid");
  console.log("═".repeat(80));

  const testQueries = [
    // Semantic queries (should be similar in both modes)
    "invoice from vendor",
    "financial statement",
    "payment document",

    // Keyword-heavy queries (should benefit from hybrid)
    "CoolAir HVAC",
    "invoice",
    "services",

    // Mixed queries
    "HVAC services invoice",
    "January statement",
    "consulting payment",
  ];

  const results: ComparisonResult[] = [];

  for (const query of testQueries) {
    const result = await compareSearchModes(query);
    results.push(result);
    printComparison(result);
  }

  // Summary statistics
  console.log();
  console.log("═".repeat(80));
  console.log("Summary");
  console.log("═".repeat(80));
  console.log();

  let rankingDifferences = 0;
  let keywordBoosts = 0;
  let totalVectorTime = 0;
  let totalHybridTime = 0;

  for (const result of results) {
    totalVectorTime += result.vectorTimeMs;
    totalHybridTime += result.hybridTimeMs;

    if (result.hybridResults.some((r) => r.keywordScore > 0)) {
      keywordBoosts++;
    }

    if (
      result.vectorResults.length > 0 &&
      result.hybridResults.length > 0 &&
      result.vectorResults[0].fileName !== result.hybridResults[0].fileName
    ) {
      rankingDifferences++;
    }
  }

  console.log(`  Total queries tested: ${results.length}`);
  console.log(`  Queries with keyword boost: ${keywordBoosts}/${results.length}`);
  console.log(`  Queries with different #1 result: ${rankingDifferences}/${results.length}`);
  console.log();
  console.log(`  Average vector search time: ${Math.round(totalVectorTime / results.length)}ms`);
  console.log(`  Average hybrid search time: ${Math.round(totalHybridTime / results.length)}ms`);
  console.log();
  console.log("  Recommendation:");
  if (keywordBoosts > results.length / 2) {
    console.log("    Use hybrid search - significant keyword boost observed");
  } else {
    console.log("    Either mode works well - choose based on use case");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
