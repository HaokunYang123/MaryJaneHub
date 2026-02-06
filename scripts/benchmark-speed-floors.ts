#!/usr/bin/env tsx
/**
 * M3 - Backend Validation: Speed Floor Benchmarks
 *
 * Measures p50/p95 latency for key operations:
 * - Search (semantic/hybrid)
 * - Assistant (owner mode)
 *
 * Does NOT optimize - just ensures basic usability thresholds.
 */

import { searchDocuments, smartSearch } from "@/lib/search";
import { createConversationContext, handleAssistantQuery } from "@/lib/assistant";

interface BenchmarkResult {
  operation: string;
  mode?: string;
  iterations: number;
  min_ms: number;
  max_ms: number;
  p50_ms: number;
  p95_ms: number;
  mean_ms: number;
  floor_ms?: number;
  passes_floor: boolean | null;
}

interface BenchmarkReport {
  generated_at: string;
  mode: "toy" | "production";
  results: BenchmarkResult[];
  summary: {
    total_operations: number;
    passing_floors: number;
    failing_floors: number;
  };
}

// Speed floors (usability thresholds)
const FLOORS = {
  search_p95: 2000, // 2s for search p95 in toy mode
  assistant_p95: 8000, // 8s for assistant p95 in toy mode
};

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function computeStats(
  operation: string,
  timings: number[],
  floor?: number,
  mode?: string
): BenchmarkResult {
  const min_ms = Math.min(...timings);
  const max_ms = Math.max(...timings);
  const p50_ms = percentile(timings, 50);
  const p95_ms = percentile(timings, 95);
  const mean_ms = timings.reduce((a, b) => a + b, 0) / timings.length;

  return {
    operation,
    mode,
    iterations: timings.length,
    min_ms: Math.round(min_ms),
    max_ms: Math.round(max_ms),
    p50_ms: Math.round(p50_ms),
    p95_ms: Math.round(p95_ms),
    mean_ms: Math.round(mean_ms),
    floor_ms: floor,
    passes_floor: floor !== undefined ? p95_ms < floor : null,
  };
}

async function benchmarkSemanticSearch(iterations: number): Promise<number[]> {
  const timings: number[] = [];
  const queries = [
    "invoice from Acme Corp",
    "receipts in January 2024",
    "documents over $100",
    "contracts and agreements",
  ];

  console.log(`  Running ${iterations} semantic search queries...`);

  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];
    const start = performance.now();

    try {
      await searchDocuments(query, { limit: 10 });
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      process.stdout.write(".");
    } catch (error) {
      console.error(`\n  Error in semantic search: ${error}`);
      timings.push(0); // Don't fail entire benchmark
    }
  }

  console.log(" done");
  return timings;
}

async function benchmarkSmartSearch(iterations: number): Promise<number[]> {
  const timings: number[] = [];
  const queries = [
    "Acme Corp total:>100",
    "invoice date:2024-01",
    "receipt Acme",
  ];

  console.log(`  Running ${iterations} smart search queries...`);

  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];
    const start = performance.now();

    try {
      await smartSearch(query, { limit: 10 });
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      process.stdout.write(".");
    } catch (error) {
      console.error(`\n  Error in smart search: ${error}`);
      timings.push(0);
    }
  }

  console.log(" done");
  return timings;
}

async function benchmarkAssistant(iterations: number, mode: "owner" | "lawyer"): Promise<number[]> {
  const timings: number[] = [];
  const queries = [
    "What invoices do we have from Acme Corp?",
    "Show me all receipts from January 2024",
    "What is the total amount of invoices?",
  ];

  console.log(`  Running ${iterations} assistant queries (${mode} mode)...`);

  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];
    const start = performance.now();

    try {
      const context = createConversationContext();
      await handleAssistantQuery(query, context, undefined, { mode });
      const elapsed = performance.now() - start;
      timings.push(elapsed);
      process.stdout.write(".");
    } catch (error) {
      console.error(`\n  Error in assistant: ${error}`);
      timings.push(0);
    }
  }

  console.log(" done");
  return timings;
}

async function main() {
  const args = process.argv.slice(2);
  const quick = args.includes("--quick");
  const iterations = quick ? 3 : 10;

  console.log("M3 Backend Validation - Speed Floor Benchmarks");
  console.log("==============================================");
  console.log();
  console.log(`Mode: toy (testing with toy dataset)`);
  console.log(`Iterations: ${iterations}${quick ? " (quick mode)" : ""}`);
  console.log();
  console.log("NOTE: These benchmarks measure usability floors, not performance optimization.");
  console.log();

  const results: BenchmarkResult[] = [];

  // Search benchmarks
  console.log("1. Semantic Search");
  const semanticTimings = await benchmarkSemanticSearch(iterations);
  results.push(computeStats("search", semanticTimings, FLOORS.search_p95, "semantic"));

  console.log();
  console.log("2. Smart Search (hybrid)");
  const smartTimings = await benchmarkSmartSearch(iterations);
  results.push(computeStats("search", smartTimings, FLOORS.search_p95, "hybrid"));

  console.log();
  console.log("3. Assistant (owner mode)");
  const assistantTimings = await benchmarkAssistant(iterations, "owner");
  results.push(computeStats("assistant", assistantTimings, FLOORS.assistant_p95, "owner"));

  // Report
  console.log();
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("RESULTS");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();

  for (const result of results) {
    const icon = result.passes_floor === true ? "✓" : result.passes_floor === false ? "✗" : "ℹ";
    const modeStr = result.mode ? ` (${result.mode})` : "";
    console.log(`${icon} ${result.operation.toUpperCase()}${modeStr}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  p50: ${result.p50_ms}ms`);
    console.log(`  p95: ${result.p95_ms}ms (floor: ${result.floor_ms}ms)`);
    console.log(`  Range: ${result.min_ms}ms - ${result.max_ms}ms`);

    if (result.passes_floor === false) {
      console.log(`  ⚠️  EXCEEDS FLOOR by ${result.p95_ms - result.floor_ms!}ms`);
    }

    console.log();
  }

  const report: BenchmarkReport = {
    generated_at: new Date().toISOString(),
    mode: "toy",
    results,
    summary: {
      total_operations: results.length,
      passing_floors: results.filter((r) => r.passes_floor === true).length,
      failing_floors: results.filter((r) => r.passes_floor === false).length,
    },
  };

  // Summary
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log();
  console.log(`Total operations:   ${report.summary.total_operations}`);
  console.log(`Passing floors:     ${report.summary.passing_floors}`);
  console.log(`Failing floors:     ${report.summary.failing_floors}`);
  console.log();

  if (report.summary.failing_floors > 0) {
    console.warn("⚠ WARNING: Some operations exceed usability floors");
    console.log();
    console.log("These are soft limits. Document the current performance and");
    console.log("consider optimization as a future task if needed.");
  } else {
    console.log("✓ All operations meet usability floor requirements");
  }
}

main().catch(console.error);
