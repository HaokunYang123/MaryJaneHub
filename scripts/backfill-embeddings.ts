#!/usr/bin/env npx tsx
/**
 * Backfill Embeddings Script
 *
 * Generates embeddings for all documents that have raw_text but no embedding.
 * Processes in batches with rate limiting to avoid API throttling.
 *
 * Usage: npm run embeddings:backfill
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { generateAndStoreEmbedding } from "../lib/search/semantic-search";

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 2000;
const DELAY_BETWEEN_DOCUMENTS_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface DocumentToProcess {
  id: string;
  file_name: string;
  document_type: string;
  raw_text: string;
  extraction: Record<string, unknown>;
}

async function getDocumentsWithoutEmbeddings(): Promise<DocumentToProcess[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("documents")
    .select("id, file_name, document_type, raw_text, extraction")
    .is("embedding", null)
    .not("raw_text", "is", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return (data || []) as DocumentToProcess[];
}

async function processDocument(doc: DocumentToProcess): Promise<{
  success: boolean;
  error?: string;
  processingTimeMs?: number;
}> {
  if (!doc.raw_text || doc.raw_text.trim().length === 0) {
    return { success: false, error: "Empty raw_text" };
  }

  return generateAndStoreEmbedding(doc.id, {
    document_type: doc.document_type,
    raw_text: doc.raw_text,
    extraction: doc.extraction,
  });
}

async function main() {
  console.log("=".repeat(60));
  console.log("Embeddings Backfill Script");
  console.log("=".repeat(60));
  console.log();

  // Fetch all documents without embeddings
  console.log("Fetching documents without embeddings...");
  const documents = await getDocumentsWithoutEmbeddings();

  if (documents.length === 0) {
    console.log("No documents found that need embeddings. All done!");
    return;
  }

  console.log(`Found ${documents.length} documents to process`);
  console.log();

  // Process in batches
  const totalBatches = Math.ceil(documents.length / BATCH_SIZE);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ fileName: string; error: string }> = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart = batchIndex * BATCH_SIZE;
    const batch = documents.slice(batchStart, batchStart + BATCH_SIZE);

    console.log(`Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} documents)...`);

    for (const doc of batch) {
      processed++;
      const progressPct = ((processed / documents.length) * 100).toFixed(1);

      try {
        const result = await processDocument(doc);

        if (result.success) {
          succeeded++;
          console.log(
            `  [${progressPct}%] ✓ ${doc.file_name} (${result.processingTimeMs}ms)`
          );
        } else {
          failed++;
          errors.push({ fileName: doc.file_name, error: result.error || "Unknown error" });
          console.log(`  [${progressPct}%] ✗ ${doc.file_name}: ${result.error}`);
        }
      } catch (err) {
        failed++;
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        errors.push({ fileName: doc.file_name, error: errorMessage });
        console.log(`  [${progressPct}%] ✗ ${doc.file_name}: ${errorMessage}`);
      }

      // Rate limiting delay between documents
      if (processed < documents.length) {
        await sleep(DELAY_BETWEEN_DOCUMENTS_MS);
      }
    }

    // Delay between batches (except for the last batch)
    if (batchIndex < totalBatches - 1) {
      console.log(`  Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  // Summary
  console.log();
  console.log("=".repeat(60));
  console.log("Summary");
  console.log("=".repeat(60));
  console.log(`Total processed: ${processed}`);
  console.log(`Succeeded: ${succeeded}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log();
    console.log("Errors:");
    for (const { fileName, error } of errors) {
      console.log(`  - ${fileName}: ${error}`);
    }
  }

  console.log();
  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
