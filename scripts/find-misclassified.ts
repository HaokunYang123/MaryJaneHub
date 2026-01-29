#!/usr/bin/env npx tsx
/**
 * Find potentially misclassified documents
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";

async function main() {
  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log("Misclassification Analysis");
  console.log("=".repeat(60) + "\n");

  // Get all documents
  const { data: docs, error } = await supabase
    .from("documents")
    .select("file_name, document_type, classification_confidence, extraction")
    .order("classification_confidence", { ascending: true });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  // Food/restaurant keywords
  const foodKeywords = [
    "restaurant", "cafe", "coffee", "grill", "kitchen",
    "diner", "pizza", "burger", "taco", "sushi", "buffet", "bakery",
    "steakhouse", "seafood", "bbq", "bar", "pub", "bistro", "eatery",
    "wendys", "mcdonalds", "starbucks", "chipotle", "subway",
    "wings", "ramen", "noodle", "thai", "chinese", "mexican",
    "indian", "italian", "japanese", "korean", "vietnamese",
    "panda", "palace", "house", "inn", "tavern", "cantina"
  ];

  // Find invoices that look like receipts
  const suspiciousInvoices = docs.filter((doc) => {
    if (doc.document_type !== "invoice") return false;

    const vendor = (doc.extraction?.data?.vendor || "").toLowerCase();
    const fileName = doc.file_name.toLowerCase();

    // Check for food keywords
    const hasFood = foodKeywords.some(
      (kw) => vendor.includes(kw) || fileName.includes(kw)
    );

    // Check if filename contains "receipt"
    const hasReceiptInName = fileName.includes("receipt");

    return hasFood || hasReceiptInName;
  });

  console.log(`Total documents: ${docs.length}`);
  console.log(`Invoices: ${docs.filter((d) => d.document_type === "invoice").length}`);
  console.log(`Receipts: ${docs.filter((d) => d.document_type === "receipt").length}`);
  console.log(`\nSuspicious invoices (likely receipts): ${suspiciousInvoices.length}\n`);

  if (suspiciousInvoices.length > 0) {
    console.log("Potentially misclassified as INVOICE (should be RECEIPT):\n");
    suspiciousInvoices.forEach((doc, i) => {
      const vendor = doc.extraction?.data?.vendor || "Unknown";
      console.log(`${i + 1}. ${doc.file_name}`);
      console.log(`   Vendor: ${vendor}`);
      console.log(`   Confidence: ${(doc.classification_confidence * 100).toFixed(1)}%`);
      console.log("");
    });
  }

  // Also check receipts that might be invoices (for completeness)
  const suspiciousReceipts = docs.filter((doc) => {
    if (doc.document_type !== "receipt") return false;
    const fileName = doc.file_name.toLowerCase();
    return fileName.includes("invoice");
  });

  if (suspiciousReceipts.length > 0) {
    console.log("\nPotentially misclassified as RECEIPT (might be INVOICE):\n");
    suspiciousReceipts.forEach((doc, i) => {
      console.log(`${i + 1}. ${doc.file_name}`);
      console.log(`   Confidence: ${(doc.classification_confidence * 100).toFixed(1)}%`);
    });
  }
}

main().catch(console.error);
