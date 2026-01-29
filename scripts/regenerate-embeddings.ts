#!/usr/bin/env npx tsx
/**
 * Regenerate Embeddings Script
 *
 * Regenerates embeddings for all documents using the new enriched text format
 * that combines structured extraction data with raw text.
 *
 * Usage: npm run embeddings:regenerate
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { generateEmbedding, generateEmbeddingText } from "../lib/gemini/embeddings";
import pLimit from "p-limit";

interface DocumentRow {
  id: string;
  file_name: string;
  document_type: string;
  raw_text: string | null;
  extraction: Record<string, unknown>;
}

async function main() {
  const supabase = getSupabase();
  const limit = pLimit(5); // 5 concurrent requests

  console.log("=".repeat(60));
  console.log("Regenerate Embeddings with Enriched Text");
  console.log("=".repeat(60) + "\n");

  // Fetch all documents
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, file_name, document_type, raw_text, extraction")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch documents:", error.message);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log("No documents found.");
    return;
  }

  console.log(`Found ${docs.length} documents to process\n`);

  let success = 0;
  let failed = 0;
  const errors: Array<{ file: string; error: string }> = [];
  const startTime = Date.now();

  // Process all documents with concurrency limit
  await Promise.all(
    (docs as DocumentRow[]).map((doc) =>
      limit(async () => {
        try {
          // Generate enriched embedding text
          const embeddingText = generateEmbeddingText({
            document_type: doc.document_type,
            raw_text: doc.raw_text,
            extraction: doc.extraction,
          });

          // Generate embedding
          const result = await generateEmbedding(embeddingText);

          if (!result.success) {
            throw new Error(result.error);
          }

          // Update database
          const { error: updateError } = await supabase
            .from("documents")
            .update({ embedding: `[${result.embedding.join(",")}]` })
            .eq("id", doc.id);

          if (updateError) {
            throw new Error(updateError.message);
          }

          success++;
          process.stdout.write(".");
        } catch (err) {
          failed++;
          const errorMsg = err instanceof Error ? err.message : String(err);
          errors.push({ file: doc.file_name, error: errorMsg });
          process.stdout.write("x");
        }
      })
    )
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n\n" + "=".repeat(60));
  console.log("Results:");
  console.log("=".repeat(60));
  console.log(`  Total:    ${docs.length}`);
  console.log(`  Success:  ${success}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Duration: ${duration}s`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    errors.slice(0, 10).forEach((e) => {
      console.log(`  - ${e.file}: ${e.error}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }
}

main().catch(console.error);
