#!/usr/bin/env npx tsx
/**
 * Analyze current document data for export planning
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";

interface DocRow {
  document_type: string;
  extraction_confidence: number | null;
  extraction: {
    type: string;
    data: Record<string, unknown>;
  };
}

async function main() {
  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log("Step 1: Understand Current Data");
  console.log("=".repeat(60) + "\n");

  // 1. Document types and counts
  console.log("1. Document Types and Counts:");
  const { data: allDocs, error } = await supabase
    .from("documents")
    .select("document_type, extraction_confidence, extraction");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  const grouped: Record<string, { count: number; totalConf: number }> = {};
  (allDocs as DocRow[]).forEach((d) => {
    const type = d.document_type || "unknown";
    if (!grouped[type]) {
      grouped[type] = { count: 0, totalConf: 0 };
    }
    grouped[type].count++;
    grouped[type].totalConf += d.extraction_confidence || 0;
  });

  Object.entries(grouped).forEach(([type, data]) => {
    const avgConf = (data.totalConf / data.count).toFixed(3);
    console.log(`  ${type}: ${data.count} docs, avg confidence: ${avgConf}`);
  });

  // 2. Date range
  console.log("\n2. Date Range:");
  const dates = (allDocs as DocRow[])
    .map((d) => {
      const data = d.extraction?.data || {};
      return (data.date as string) || (data.invoice_date as string) || null;
    })
    .filter(Boolean)
    .sort();

  console.log(`  Earliest: ${dates[0] || "N/A"}`);
  console.log(`  Latest: ${dates[dates.length - 1] || "N/A"}`);

  // 3. Amount range
  console.log("\n3. Amount Statistics:");
  const amounts = (allDocs as DocRow[])
    .map((d) => {
      const data = d.extraction?.data || {};
      return (data.total as number) || null;
    })
    .filter((a): a is number => a !== null && !isNaN(a));

  const totalAmount = amounts.reduce((sum, a) => sum + a, 0);
  const minAmount = Math.min(...amounts);
  const maxAmount = Math.max(...amounts);

  console.log(`  Total Amount: $${totalAmount.toFixed(2)}`);
  console.log(`  Min: $${minAmount.toFixed(2)}`);
  console.log(`  Max: $${maxAmount.toFixed(2)}`);
  console.log(`  Avg: $${(totalAmount / amounts.length).toFixed(2)}`);

  // 4. Sample extractions by type
  console.log("\n4. Sample Extraction for Each Type:");
  const seenTypes = new Set<string>();

  for (const doc of allDocs as DocRow[]) {
    const type = doc.document_type || "unknown";
    if (seenTypes.has(type)) continue;
    seenTypes.add(type);

    console.log(`\n  [${type}]:`);
    const data = doc.extraction?.data || {};
    const keys = Object.keys(data).filter(
      (k) => !["confidence", "raw_response", "items", "line_items", "transactions"].includes(k)
    );

    keys.slice(0, 8).forEach((k) => {
      const val = data[k];
      let display: string;
      if (val === null) {
        display = "null";
      } else if (Array.isArray(val)) {
        display = `[${val.length} items]`;
      } else if (typeof val === "object") {
        display = JSON.stringify(val).slice(0, 50);
      } else {
        display = String(val);
      }
      console.log(`    ${k}: ${display}`);
    });
  }

  // 5. Quality issues
  console.log("\n5. Quality Issues:");
  let missingDate = 0;
  let missingVendor = 0;
  let missingAmount = 0;
  let lowConfidence = 0;

  (allDocs as DocRow[]).forEach((d) => {
    const data = d.extraction?.data || {};
    const date = (data.date as string) || (data.invoice_date as string);
    const vendor = (data.vendor as string) || (data.merchant_name as string);
    const amount = data.total as number;

    if (!date) missingDate++;
    if (!vendor) missingVendor++;
    if (amount === null || amount === undefined) missingAmount++;
    if ((d.extraction_confidence || 0) < 0.7) lowConfidence++;
  });

  console.log(`  Missing date: ${missingDate}`);
  console.log(`  Missing vendor/merchant: ${missingVendor}`);
  console.log(`  Missing amount: ${missingAmount}`);
  console.log(`  Low confidence (<0.7): ${lowConfidence}`);
}

main().catch(console.error);
