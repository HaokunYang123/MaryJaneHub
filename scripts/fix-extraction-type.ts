#!/usr/bin/env npx tsx
/**
 * Fix extraction.type to match document_type column
 *
 * After reclassification, the document_type column was updated but
 * the extraction.type field still has the old value. This script
 * synchronizes them.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log(`Fix extraction.type Field ${dryRun ? "(DRY RUN)" : ""}`);
  console.log("=".repeat(60) + "\n");

  if (dryRun) {
    console.log("This is a DRY RUN. No changes will be made.");
    console.log("Add --execute flag to apply changes.\n");
  }

  // Find documents where extraction.type doesn't match document_type
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, file_name, document_type, extraction");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  const mismatched = docs.filter((d) => {
    const extractionType = d.extraction?.type;
    return extractionType && extractionType !== d.document_type;
  });

  console.log(`Total documents: ${docs.length}`);
  console.log(`Mismatched extraction.type: ${mismatched.length}\n`);

  if (mismatched.length === 0) {
    console.log("No mismatches found. All extraction.type fields match document_type.");
    return;
  }

  console.log("Mismatches to fix:\n");
  mismatched.slice(0, 10).forEach((d, i) => {
    console.log(`${i + 1}. ${d.file_name}`);
    console.log(`   extraction.type: ${d.extraction?.type} → ${d.document_type}`);
  });
  if (mismatched.length > 10) {
    console.log(`... and ${mismatched.length - 10} more\n`);
  }

  if (dryRun) {
    console.log("\n" + "-".repeat(60));
    console.log("DRY RUN complete. Run with --execute to apply changes.");
    return;
  }

  // Apply fixes
  console.log("\nApplying fixes...\n");

  let fixed = 0;
  let errors = 0;

  for (const doc of mismatched) {
    try {
      // Update extraction.type to match document_type
      const updatedExtraction = {
        ...doc.extraction,
        type: doc.document_type,
      };

      const { error: updateError } = await supabase
        .from("documents")
        .update({ extraction: updatedExtraction })
        .eq("id", doc.id);

      if (updateError) {
        console.error(`Error updating ${doc.file_name}:`, updateError.message);
        errors++;
      } else {
        fixed++;
        process.stdout.write(".");
      }
    } catch (err) {
      console.error(`Error processing ${doc.file_name}:`, err);
      errors++;
    }
  }

  console.log("\n\n" + "=".repeat(60));
  console.log("Results:");
  console.log("=".repeat(60));
  console.log(`  Fixed: ${fixed}`);
  console.log(`  Errors: ${errors}`);
}

main().catch(console.error);
