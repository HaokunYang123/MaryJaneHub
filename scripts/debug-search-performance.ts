#!/usr/bin/env npx tsx
/**
 * Debug Search Performance Script
 *
 * Investigates why vector search is slower than hybrid search:
 * 1. Runs multiple consecutive searches to check for cold start issues
 * 2. Measures embedding generation vs database query time separately
 * 3. Checks if indexes are being used via EXPLAIN ANALYZE
 *
 * Usage: npm run debug:search
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { generateEmbedding } from "../lib/gemini/embeddings";
import { searchDocuments, hybridSearchDocuments } from "../lib/search/semantic-search";

const TEST_QUERY = "invoice from vendor";

function formatMs(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

async function measureEmbeddingTime(): Promise<{ embedding: number[]; timeMs: number }> {
  const start = performance.now();
  const result = await generateEmbedding(TEST_QUERY);
  const timeMs = performance.now() - start;

  if (!result.success) {
    throw new Error(`Embedding failed: ${result.error}`);
  }

  return { embedding: result.embedding, timeMs };
}

async function measureRawDatabaseQuery(embedding: number[]): Promise<{ count: number; timeMs: number }> {
  const supabase = getSupabase();
  const embeddingStr = `[${embedding.join(",")}]`;

  const start = performance.now();
  const { data, error } = await supabase.rpc("search_documents", {
    query_embedding: embeddingStr,
    match_threshold: 0.3,
    match_count: 10,
    filter_document_type: null,
  });
  const timeMs = performance.now() - start;

  if (error) {
    throw new Error(`Database query failed: ${error.message}`);
  }

  return { count: (data || []).length, timeMs };
}

async function measureHybridDatabaseQuery(embedding: number[]): Promise<{ count: number; timeMs: number }> {
  const supabase = getSupabase();
  const embeddingStr = `[${embedding.join(",")}]`;

  const start = performance.now();
  const { data, error } = await supabase.rpc("hybrid_search_documents", {
    query_text: TEST_QUERY,
    query_embedding: embeddingStr,
    match_count: 10,
    vector_weight: 0.7,
    keyword_weight: 0.3,
    min_score: 0.2,
    filter_document_type: null,
  });
  const timeMs = performance.now() - start;

  if (error) {
    throw new Error(`Hybrid query failed: ${error.message}`);
  }

  return { count: (data || []).length, timeMs };
}

async function checkIndexUsage(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("Checking Index Usage (via pg_indexes)");
  console.log("═══════════════════════════════════════════════════════════\n");

  const supabase = getSupabase();

  // Check what indexes exist on the documents table
  const { data: indexes, error: indexError } = await supabase
    .rpc("get_table_indexes", { table_name: "documents" })
    .single();

  if (indexError) {
    // Try a direct query to pg_indexes
    const { data: pgIndexes, error: pgError } = await supabase
      .from("pg_indexes" as never)
      .select("indexname, indexdef")
      .eq("tablename", "documents");

    if (pgError) {
      console.log("  Could not query pg_indexes (permission denied)");
      console.log("  Run this SQL manually in Supabase SQL Editor:");
      console.log();
      console.log("  SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'documents';");
      console.log();
    } else {
      console.log("  Indexes on documents table:");
      for (const idx of (pgIndexes || []) as { indexname: string; indexdef: string }[]) {
        console.log(`    - ${idx.indexname}`);
        console.log(`      ${idx.indexdef}`);
      }
    }
  }

  // Check document count
  const { count, error: countError } = await supabase
    .from("documents")
    .select("*", { count: "exact", head: true });

  if (!countError) {
    console.log(`\n  Document count: ${count}`);
    console.log(`  IVFFlat lists = 100 (optimal for ~10,000 docs)`);
    console.log(`  With ${count} docs, lists should be ~${Math.max(1, Math.floor(Math.sqrt(count || 1)))}`);

    if ((count || 0) < 1000) {
      console.log("\n  ⚠ WARNING: IVFFlat with lists=100 is inefficient for small datasets!");
      console.log("  Consider using HNSW index instead, or reduce lists parameter.");
    }
  }
}

async function runConsecutiveSearches(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("Consecutive Search Timing (checking cold start)");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log(`Query: "${TEST_QUERY}"\n`);

  // First, get an embedding to reuse
  console.log("Generating embedding for reuse...");
  const { embedding, timeMs: embeddingTime } = await measureEmbeddingTime();
  console.log(`  Embedding generated in ${formatMs(embeddingTime)}\n`);

  // Vector search - full function (includes embedding generation)
  console.log("Vector Search (full function, includes embedding):");
  const vectorFullTimes: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const start = performance.now();
    await searchDocuments(TEST_QUERY, { limit: 10, threshold: 0.3 });
    const timeMs = performance.now() - start;
    vectorFullTimes.push(timeMs);
    console.log(`  Run ${i}: ${formatMs(timeMs)}`);
  }
  const vectorFullAvg = vectorFullTimes.reduce((a, b) => a + b, 0) / vectorFullTimes.length;
  console.log(`  Average: ${formatMs(vectorFullAvg)}`);
  console.log(`  First vs Rest: ${formatMs(vectorFullTimes[0])} vs ${formatMs(vectorFullTimes.slice(1).reduce((a, b) => a + b, 0) / 4)}`);

  // Vector search - database only (reusing embedding)
  console.log("\nVector Search (database only, reusing embedding):");
  const vectorDbTimes: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const { timeMs } = await measureRawDatabaseQuery(embedding);
    vectorDbTimes.push(timeMs);
    console.log(`  Run ${i}: ${formatMs(timeMs)}`);
  }
  const vectorDbAvg = vectorDbTimes.reduce((a, b) => a + b, 0) / vectorDbTimes.length;
  console.log(`  Average: ${formatMs(vectorDbAvg)}`);

  // Hybrid search - full function
  console.log("\nHybrid Search (full function, includes embedding):");
  const hybridFullTimes: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const start = performance.now();
    await hybridSearchDocuments(TEST_QUERY, { limit: 10, minScore: 0.2 });
    const timeMs = performance.now() - start;
    hybridFullTimes.push(timeMs);
    console.log(`  Run ${i}: ${formatMs(timeMs)}`);
  }
  const hybridFullAvg = hybridFullTimes.reduce((a, b) => a + b, 0) / hybridFullTimes.length;
  console.log(`  Average: ${formatMs(hybridFullAvg)}`);

  // Hybrid search - database only
  console.log("\nHybrid Search (database only, reusing embedding):");
  const hybridDbTimes: number[] = [];
  for (let i = 1; i <= 5; i++) {
    const { timeMs } = await measureHybridDatabaseQuery(embedding);
    hybridDbTimes.push(timeMs);
    console.log(`  Run ${i}: ${formatMs(timeMs)}`);
  }
  const hybridDbAvg = hybridDbTimes.reduce((a, b) => a + b, 0) / hybridDbTimes.length;
  console.log(`  Average: ${formatMs(hybridDbAvg)}`);

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("Summary");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("  Component Breakdown:");
  console.log(`    Embedding generation: ~${formatMs(embeddingTime)}`);
  console.log(`    Vector DB query:      ~${formatMs(vectorDbAvg)}`);
  console.log(`    Hybrid DB query:      ~${formatMs(hybridDbAvg)}`);

  console.log("\n  Full Search Times:");
  console.log(`    Vector search avg:    ${formatMs(vectorFullAvg)}`);
  console.log(`    Hybrid search avg:    ${formatMs(hybridFullAvg)}`);

  console.log("\n  Analysis:");

  // Check for cold start
  const vectorColdStartRatio = vectorFullTimes[0] / (vectorFullTimes.slice(1).reduce((a, b) => a + b, 0) / 4);
  if (vectorColdStartRatio > 1.5) {
    console.log(`    - Cold start detected: First query ${vectorColdStartRatio.toFixed(1)}x slower`);
  } else {
    console.log("    - No significant cold start effect");
  }

  // Compare DB query times
  const dbTimeRatio = vectorDbAvg / hybridDbAvg;
  if (dbTimeRatio > 1.5) {
    console.log(`    - Vector DB query is ${dbTimeRatio.toFixed(1)}x slower than hybrid`);
    console.log("    - This suggests the search_documents function is less efficient");
  } else if (dbTimeRatio < 0.67) {
    console.log(`    - Hybrid DB query is ${(1/dbTimeRatio).toFixed(1)}x slower than vector`);
  } else {
    console.log("    - DB query times are similar between vector and hybrid");
  }

  // Check if embedding is the bottleneck
  const embeddingPct = (embeddingTime / vectorFullAvg) * 100;
  if (embeddingPct > 50) {
    console.log(`    - Embedding generation is ${embeddingPct.toFixed(0)}% of total time`);
  }
}

async function suggestFixes(): Promise<void> {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("Recommended Fixes");
  console.log("═══════════════════════════════════════════════════════════\n");

  console.log("  1. Replace IVFFlat with HNSW index (better for small datasets):");
  console.log();
  console.log("     DROP INDEX IF EXISTS documents_embedding_idx;");
  console.log("     CREATE INDEX documents_embedding_hnsw_idx ON documents");
  console.log("       USING hnsw (embedding vector_cosine_ops)");
  console.log("       WITH (m = 16, ef_construction = 64);");
  console.log();
  console.log("  2. Or reduce IVFFlat lists for small datasets:");
  console.log();
  console.log("     DROP INDEX IF EXISTS documents_embedding_idx;");
  console.log("     CREATE INDEX documents_embedding_idx ON documents");
  console.log("       USING ivfflat (embedding vector_cosine_ops)");
  console.log("       WITH (lists = 4);  -- sqrt(number of docs)");
  console.log();
  console.log("  3. Optimize search_documents function (avoid double computation):");
  console.log();
  console.log("     The current function computes similarity twice:");
  console.log("     - In WHERE clause: 1 - (embedding <=> query) > threshold");
  console.log("     - In ORDER BY: embedding <=> query");
  console.log();
  console.log("     Consider using a CTE or subquery to compute once.");
}

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("Search Performance Debug Tool");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    await checkIndexUsage();
    await runConsecutiveSearches();
    await suggestFixes();
  } catch (error) {
    console.error("\nError:", error);
    process.exit(1);
  }
}

main();
