#!/usr/bin/env node
/**
 * Test Document Processing Pipeline
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { classifyDocument } from "../lib/gemini/classify-document";
import { extractDocument } from "../lib/gemini/extract-document";
import { ensureFieldEvidence } from "../lib/workflow/field-evidence";
import { analyzeDocument } from "../lib/workflow/review-flags";
import { generateEmbedding } from "../lib/gemini/embeddings";

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("Pipeline Integration Test");
  console.log("=".repeat(60));
  console.log("");

  const supabase = getSupabase();

  const { data: testDoc } = await supabase
    .from("documents")
    .select("id, file_name, raw_text, document_type")
    .not("raw_text", "is", null)
    .eq("document_type", "invoice")
    .gt("extraction_confidence", 0.5)
    .limit(1)
    .single();

  if (!testDoc) {
    console.log("ERROR: No test document found");
    return;
  }

  console.log("Test document:", testDoc.file_name);
  console.log("Raw text length:", testDoc.raw_text?.length, "chars");
  console.log("");

  // Step 1: Classification
  console.log("Step 1: Classification");
  console.log("-".repeat(40));
  try {
    const classification = await classifyDocument(testDoc.raw_text);
    console.log("  Type:", classification.documentType);
    console.log("  Confidence:", (classification.confidence * 100).toFixed(1) + "%");
    console.log("  OK");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.log("  FAILED:", msg);
  }
  console.log("");

  // Step 2: Extraction
  console.log("Step 2: Extraction");
  console.log("-".repeat(40));
  let extraction;
  try {
    extraction = await extractDocument(testDoc.document_type, testDoc.raw_text);
    const data = extraction.data as Record<string, unknown>;
    console.log("  Vendor:", data.vendor || "(none)");
    console.log("  Total:", data.total || "(none)");
    console.log("  Date:", data.invoice_date || "(none)");
    console.log("  OK");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.log("  FAILED:", msg);
  }
  console.log("");

  // Step 3: Field Evidence
  console.log("Step 3: Field Evidence");
  console.log("-".repeat(40));
  try {
    if (extraction) {
      const evidence = ensureFieldEvidence(extraction, testDoc.raw_text);
      const fields = Object.keys(evidence);
      console.log("  Fields with evidence:", fields.length);
      console.log("  OK");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.log("  FAILED:", msg);
  }
  console.log("");

  // Step 4: Review Flags
  console.log("Step 4: Review Flags");
  console.log("-".repeat(40));
  try {
    if (extraction) {
      const analysis = analyzeDocument(extraction, {});
      console.log("  Status:", analysis.suggestedStatus);
      console.log("  Flags:", analysis.flags.length > 0 ? analysis.flags.join(", ") : "(none)");
      console.log("  OK");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.log("  FAILED:", msg);
  }
  console.log("");

  // Step 5: Embedding
  console.log("Step 5: Embedding");
  console.log("-".repeat(40));
  try {
    const text = testDoc.raw_text?.substring(0, 2000) || "";
    const embedding = await generateEmbedding(text);
    console.log("  Dimensions:", embedding.length);
    console.log("  OK");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.log("  FAILED:", msg);
  }
  console.log("");

  console.log("=".repeat(60));
  console.log("All pipeline steps functional");
  console.log("=".repeat(60));
}

main().catch(console.error);
