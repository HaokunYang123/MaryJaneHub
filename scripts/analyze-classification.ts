import { config } from "dotenv";
config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";
import { analyzeClassification, validateClassification } from "../lib/gemini/validate-classification";

async function main() {
  const supabase = getSupabase();

  // Test with BEGA SUPPLY invoice
  const { data } = await supabase
    .from("documents")
    .select("file_name, raw_text, document_type, classification_confidence")
    .eq("file_name", "2015-07-20_DOC_BEGA_SUPPLY_$495.00.pdf")
    .single();

  if (!data) {
    console.log("Document not found");
    return;
  }

  console.log("=== Classification Analysis for BEGA SUPPLY ===\n");
  console.log("Current type:", data.document_type);
  console.log("Current confidence:", data.classification_confidence);

  const analysis = analyzeClassification(data.raw_text || "", "BEGA SUPPLY");

  console.log("\n=== Indicator Analysis ===");
  console.log("Suggested type:", analysis.suggestedType);
  console.log("\nIndicator counts:");
  Object.entries(analysis.indicatorCounts).forEach(([type, count]) => {
    if (count > 0) console.log(`  ${type}: ${count}`);
  });

  console.log("\nInvoice indicators found:", analysis.invoiceIndicators);
  console.log("Receipt indicators found:", analysis.receiptIndicators);

  // Test validation
  const validation = validateClassification(
    data.document_type as any,
    data.classification_confidence || 0,
    data.raw_text || "",
    "BEGA SUPPLY"
  );

  console.log("\n=== Validation Result ===");
  console.log("Original type:", validation.originalType);
  console.log("Validated type:", validation.validatedType);
  console.log("Was corrected:", validation.wasCorrected);
  if (validation.correctionReason) {
    console.log("Reason:", validation.correctionReason);
  }
}

main().catch(console.error);
