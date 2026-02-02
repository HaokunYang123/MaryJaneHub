#!/usr/bin/env npx tsx
/**
 * Deterministic embedding cache tests (no network).
 */

import { generateAndStoreEmbeddingWithDeps } from "../lib/search/semantic-search";

type CacheEntry = { embedding: number[] };

async function run(): Promise<void> {
  const failures: string[] = [];
  const cache = new Map<string, CacheEntry>();
  let generateCalls = 0;
  let updateDocCalls = 0;

  const deps = {
    fetchEmbeddingByKey: async (key: string) => cache.get(key) || null,
    generateEmbedding: async () => {
      generateCalls += 1;
      return {
        success: true,
        embedding: [1, 2, 3],
        truncated: false,
        processingTimeMs: 5,
      };
    },
    updateDocumentEmbedding: async () => {
      updateDocCalls += 1;
      return { success: true as const };
    },
    updateEmbeddingCache: async (key: string, embedding: number[]) => {
      cache.set(key, { embedding });
    },
  };
  const doc = { document_type: "invoice", raw_text: "Hello World", extraction: { data: {} } };
  const first = await generateAndStoreEmbeddingWithDeps("doc-1", doc, deps);
  const second = await generateAndStoreEmbeddingWithDeps("doc-1", doc, deps);
  const third = await generateAndStoreEmbeddingWithDeps("doc-1", { ...doc, raw_text: "Different" }, deps);

  if (!first.success || !second.success || !third.success) {
    failures.push("expected all embedding calls to succeed");
  }
  if (generateCalls !== 2) {
    failures.push(`expected generateEmbedding called 2 times, got ${generateCalls}`);
  }
  if (updateDocCalls !== 3) {
    failures.push(`expected updateDocumentEmbedding called 3 times, got ${updateDocCalls}`);
  }

  if (failures.length > 0) {
    console.error("Embedding cache test FAILED:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }

  console.log("Embedding cache test PASSED");
}

run().catch((error) => {
  console.error("Embedding cache test failed:", error);
  process.exit(1);
});
