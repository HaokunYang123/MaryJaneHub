#!/usr/bin/env npx tsx
/**
 * Reclassify Documents Script
 *
 * Reclassifies documents using improved logic and validation rules.
 * Can use rule-based validation only (fast) or re-run Gemini classification (thorough).
 *
 * Usage:
 *   npm run reclassify:dry             # Preview changes (rules only)
 *   npm run reclassify                 # Apply changes (rules only)
 *   npm run reclassify -- --gemini     # Re-run Gemini classification
 *   npm run reclassify -- --type=invoice  # Only reclassify invoices
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { validateClassification, analyzeClassification } from "../lib/gemini/validate-classification";
import { classifyDocument } from "../lib/gemini/classify-document";
import type { DocumentType } from "../lib/gemini/document-types";
import pLimit from "p-limit";

interface ReclassifyResult {
  total: number;
  analyzed: number;
  corrected: number;
  unchanged: number;
  errors: number;
  corrections: Array<{
    id: string;
    fileName: string;
    oldType: string;
    newType: string;
    reason: string;
  }>;
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      result[key] = value || "true";
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args["dry-run"] === "true";
  const useGemini = args.gemini === "true";
  const filterType = args.type as DocumentType | undefined;

  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log(`Reclassify Documents ${dryRun ? "(DRY RUN)" : ""}`);
  console.log("=".repeat(60));
  console.log(`Mode: ${useGemini ? "Gemini re-classification" : "Rule-based validation"}`);
  if (filterType) console.log(`Filter: ${filterType} only`);
  console.log("");

  // Fetch documents
  let query = supabase
    .from("documents")
    .select("id, file_name, document_type, classification_confidence, extraction, raw_text")
    .order("created_at", { ascending: false });

  if (filterType) {
    query = query.eq("document_type", filterType);
  }

  const { data: docs, error } = await query;

  if (error) {
    console.error("Error fetching documents:", error.message);
    process.exit(1);
  }

  if (!docs || docs.length === 0) {
    console.log("No documents found.");
    return;
  }

  console.log(`Found ${docs.length} documents to analyze\n`);

  const result: ReclassifyResult = {
    total: docs.length,
    analyzed: 0,
    corrected: 0,
    unchanged: 0,
    errors: 0,
    corrections: [],
  };

  // Process with concurrency limit
  const limit = pLimit(useGemini ? 3 : 10);

  await Promise.all(
    docs.map((doc) =>
      limit(async () => {
        try {
          result.analyzed++;

          const currentType = doc.document_type as DocumentType;
          const vendorName =
            doc.extraction?.data?.vendor ||
            doc.extraction?.data?.merchant_name ||
            null;
          const rawText = doc.raw_text || "";

          let newType: DocumentType;
          let reason: string;

          if (useGemini && rawText) {
            // Re-run Gemini classification with improved prompt
            const classification = await classifyDocument(rawText);

            // Then validate the result
            const validation = validateClassification(
              classification.documentType,
              classification.confidence,
              rawText,
              vendorName
            );

            newType = validation.validatedType;
            reason = validation.wasCorrected
              ? `Gemini: ${classification.documentType} → Validation: ${validation.correctionReason}`
              : `Gemini reclassified: ${classification.reasoning}`;
          } else {
            // Use rule-based validation only
            const validation = validateClassification(
              currentType,
              doc.classification_confidence || 0,
              rawText,
              vendorName
            );

            newType = validation.validatedType;
            reason = validation.correctionReason || "No change needed";
          }

          if (newType !== currentType) {
            result.corrected++;
            result.corrections.push({
              id: doc.id,
              fileName: doc.file_name,
              oldType: currentType,
              newType: newType,
              reason: reason,
            });

            if (!dryRun) {
              // Update database
              const { error: updateError } = await supabase
                .from("documents")
                .update({
                  document_type: newType,
                  // Update sync_status for receipts
                  sync_status: newType === "receipt" ? "not_applicable" : undefined,
                })
                .eq("id", doc.id);

              if (updateError) {
                console.error(`Error updating ${doc.file_name}:`, updateError.message);
                result.errors++;
              }
            }

            process.stdout.write("*");
          } else {
            result.unchanged++;
            process.stdout.write(".");
          }
        } catch (err) {
          result.errors++;
          console.error(`\nError processing ${doc.file_name}:`, err);
        }
      })
    )
  );

  console.log("\n\n" + "=".repeat(60));
  console.log("Results:");
  console.log("=".repeat(60));
  console.log(`  Total analyzed: ${result.analyzed}`);
  console.log(`  Corrected: ${result.corrected}`);
  console.log(`  Unchanged: ${result.unchanged}`);
  console.log(`  Errors: ${result.errors}`);

  if (result.corrections.length > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("Corrections" + (dryRun ? " (WOULD BE MADE)" : " Made") + ":");
    console.log("=".repeat(60));

    result.corrections.forEach((c, i) => {
      console.log(`\n${i + 1}. ${c.fileName}`);
      console.log(`   ${c.oldType} → ${c.newType}`);
      console.log(`   Reason: ${c.reason}`);
    });
  }

  if (dryRun && result.corrections.length > 0) {
    console.log("\n" + "-".repeat(60));
    console.log("This was a DRY RUN. No changes were made.");
    console.log("Run without --dry-run to apply these corrections.");
  }

  // Show final counts
  if (!dryRun && result.corrected > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("Updated Document Counts:");
    console.log("=".repeat(60));

    const { data: counts } = await supabase
      .from("documents")
      .select("document_type");

    const typeCounts: Record<string, number> = {};
    counts?.forEach((d) => {
      typeCounts[d.document_type] = (typeCounts[d.document_type] || 0) + 1;
    });

    Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
  }
}

main().catch(console.error);
