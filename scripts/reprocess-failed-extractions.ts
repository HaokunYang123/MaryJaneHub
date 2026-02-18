#!/usr/bin/env node
/**
 * Reprocess Failed Extractions
 *
 * Re-runs extraction for documents with sync_status = 'extraction_failed'
 * These documents have raw_text (OCR succeeded) but extraction failed.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { classifyDocument } from "../lib/gemini/classify-document";
import { extractDocument } from "../lib/gemini/extract-document";
import { ensureFieldEvidence } from "../lib/workflow/field-evidence";
import { analyzeDocument } from "../lib/workflow/review-flags";
import { getDocumentLayout } from "../lib/supabase/document-layouts";
import { requireSafeEnv } from "./lib/check-env";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  requireSafeEnv(args, "reprocess-failed-extractions");
  const dryRun = args.includes("--dry-run");
  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log("Reprocess Failed Extractions");
  console.log("=".repeat(60));
  console.log(`dryRun: ${dryRun}`);
  console.log();

  // Fetch failed documents
  const { data: failedDocs, error } = await supabase
    .from("documents")
    .select("id, file_name, raw_text, document_type")
    .eq("sync_status", "extraction_failed")
    .not("raw_text", "is", null);

  if (error) {
    console.error("Failed to fetch documents:", error.message);
    process.exit(1);
  }

  if (!failedDocs || failedDocs.length === 0) {
    console.log("No failed extractions found.");
    return;
  }

  console.log(`Found ${failedDocs.length} documents to reprocess.\n`);

  let success = 0;
  let failed = 0;

  for (const doc of failedDocs) {
    console.log(`Processing: ${doc.file_name}`);
    console.log(`  ID: ${doc.id}`);
    console.log(`  Raw text length: ${doc.raw_text?.length || 0} chars`);

    if (dryRun) {
      console.log("  [DRY RUN] Would reprocess\n");
      success++;
      continue;
    }

    try {
      // Step 1: Re-classify if needed
      let docType = doc.document_type;
      let classificationConfidence = 0;

      if (!docType || docType === "other") {
        console.log("  Classifying...");
        const classification = await classifyDocument(doc.raw_text);
        docType = classification.documentType;
        classificationConfidence = classification.confidence;
        console.log(`  Classified as: ${docType} (${(classificationConfidence * 100).toFixed(1)}%)`);
      }

      // Step 2: Extract
      console.log("  Extracting...");
      const extraction = await extractDocument(docType, doc.raw_text);
      const extractionConfidence =
        typeof extraction.data.confidence === "number" ? extraction.data.confidence : 0;
      console.log(`  Extraction confidence: ${(extractionConfidence * 100).toFixed(1)}%`);

      // Step 3: Add field evidence
      const layoutRecord = await getDocumentLayout(doc.id).catch(() => null);
      const fieldEvidence = ensureFieldEvidence(
        extraction,
        doc.raw_text,
        undefined,
        layoutRecord?.layout
      );
      const extractionData = extraction.data as Record<string, unknown>;
      extractionData.field_evidence = fieldEvidence;

      // Step 4: Analyze review flags
      const reviewAnalysis = analyzeDocument(extraction, {});
      const syncStatus = reviewAnalysis.suggestedStatus;
      const confidenceScore = reviewAnalysis.confidenceScore || extractionConfidence || 0;

      console.log(`  Suggested status: ${syncStatus}`);

      // Step 5: Update document
      const { error: updateError } = await supabase
        .from("documents")
        .update({
          document_type: docType,
          classification_confidence: classificationConfidence || undefined,
          extraction: extraction,
          extraction_confidence: confidenceScore,
          sync_status: syncStatus,
          review_flags: reviewAnalysis.flags,
          confidence_score: confidenceScore,
          updated_at: new Date().toISOString(),
        })
        .eq("id", doc.id);

      if (updateError) {
        console.log(`  ERROR: ${updateError.message}\n`);
        failed++;
        continue;
      }

      // Step 6: Log audit
      await supabase.from("audit_logs").insert({
        document_id: doc.id,
        actor: "system",
        action: "modified",
        after_data: {
          reprocessed: true,
          new_sync_status: syncStatus,
          extraction_confidence: confidenceScore,
        },
        notes: "Reprocessed failed extraction",
      });

      console.log(`  SUCCESS: ${syncStatus}\n`);
      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.log(`  ERROR: ${msg}\n`);
      failed++;
    }
  }

  console.log("=".repeat(60));
  console.log(`Done. Success: ${success}, Failed: ${failed}`);
}

main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
