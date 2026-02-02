#!/usr/bin/env npx tsx
/**
 * Check for filename/document_type mismatches
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getSupabase } from "../lib/supabase/client";

async function main() {
  const supabase = getSupabase();

  console.log("=".repeat(60));
  console.log("Filename/Type Mismatch Analysis");
  console.log("=".repeat(60) + "\n");

  // Find mismatches
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, file_name, document_type, drive_file_id")
    .order("file_name");

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  // Find receipts with INVOICE prefix
  const receiptsWithInvoicePrefix = docs.filter(
    (d) => d.document_type === "receipt" && d.file_name.includes("_INVOICE_")
  );

  // Find invoices with RECEIPT prefix
  const invoicesWithReceiptPrefix = docs.filter(
    (d) => d.document_type === "invoice" && d.file_name.includes("_RECEIPT_")
  );

  console.log("Summary:");
  console.log(`  Total documents: ${docs.length}`);
  console.log(`  Receipts with INVOICE prefix: ${receiptsWithInvoicePrefix.length}`);
  console.log(`  Invoices with RECEIPT prefix: ${invoicesWithReceiptPrefix.length}`);
  console.log(`  Total needing rename: ${receiptsWithInvoicePrefix.length + invoicesWithReceiptPrefix.length}`);

  if (receiptsWithInvoicePrefix.length > 0) {
    console.log("\n" + "=".repeat(40));
    console.log("Receipts with wrong INVOICE prefix:");
    console.log("=".repeat(40));
    receiptsWithInvoicePrefix.slice(0, 10).forEach((d, i) => {
      console.log(`${i + 1}. ${d.file_name}`);
    });
    if (receiptsWithInvoicePrefix.length > 10) {
      console.log(`... and ${receiptsWithInvoicePrefix.length - 10} more`);
    }
  }

  if (invoicesWithReceiptPrefix.length > 0) {
    console.log("\n" + "=".repeat(40));
    console.log("Invoices with wrong RECEIPT prefix:");
    console.log("=".repeat(40));
    invoicesWithReceiptPrefix.forEach((d, i) => {
      console.log(`${i + 1}. ${d.file_name}`);
    });
  }

  // Show breakdown by type and prefix
  console.log("\n" + "=".repeat(40));
  console.log("Prefix breakdown by document_type:");
  console.log("=".repeat(40));

  const types = ["receipt", "invoice", "bank_statement", "correspondence", "other"];
  for (const type of types) {
    const ofType = docs.filter((d) => d.document_type === type);
    const withReceipt = ofType.filter((d) => d.file_name.includes("_RECEIPT_")).length;
    const withInvoice = ofType.filter((d) => d.file_name.includes("_INVOICE_")).length;
    const withBankStmt = ofType.filter((d) => d.file_name.includes("_BANK-STMT_")).length;
    const withDoc = ofType.filter((d) => d.file_name.includes("_DOC_")).length;
    const other = ofType.length - withReceipt - withInvoice - withBankStmt - withDoc;

    console.log(`\n  ${type} (${ofType.length} total):`);
    if (withReceipt) console.log(`    _RECEIPT_: ${withReceipt}`);
    if (withInvoice) console.log(`    _INVOICE_: ${withInvoice}`);
    if (withBankStmt) console.log(`    _BANK-STMT_: ${withBankStmt}`);
    if (withDoc) console.log(`    _DOC_: ${withDoc}`);
    if (other) console.log(`    Other: ${other}`);
  }

  // Count files that need renaming (DOC prefix but not "other" type)
  console.log("\n" + "=".repeat(40));
  console.log("Files needing rename (wrong _DOC_ prefix):");
  console.log("=".repeat(40));

  const invoicesWithDoc = docs.filter(
    (d) => d.document_type === "invoice" && d.file_name.includes("_DOC_")
  );
  const receiptsWithDoc = docs.filter(
    (d) => d.document_type === "receipt" && d.file_name.includes("_DOC_")
  );

  console.log(`  Invoices with _DOC_ prefix: ${invoicesWithDoc.length}`);
  console.log(`  Receipts with _DOC_ prefix: ${receiptsWithDoc.length}`);
  console.log(`  Total needing rename: ${invoicesWithDoc.length + receiptsWithDoc.length}`);

  if (invoicesWithDoc.length > 0) {
    console.log("\n  Sample invoices with wrong prefix:");
    invoicesWithDoc.slice(0, 5).forEach((d, i) => {
      console.log(`    ${i + 1}. ${d.file_name}`);
    });
  }
}

main().catch(console.error);
