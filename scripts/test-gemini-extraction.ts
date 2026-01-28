import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { extractInvoiceWithGemini } from "../lib/gemini/extract-invoice.js";

// Sample raw text from OCR output (DEMO - Sliced Invoices)
const SAMPLE_RAW_TEXT = `DEMO - Sliced Invoices
Order Number 12345
Invoice Number INV-3337
January 25, 2016
Demo Business
demo@slicedinvoices.com
Suite 5A-1204
123 Somewhere Street
Your City AZ 12345
Admin
admin@yourwebsite.com
Test Business
123 Somewhere St
Melbourne, VIC 3000
Web Design
This is a sample invoice.
1
$85.00
$85.00
Sub Total
$85.00
Tax
$8.50
Invoice Total
$93.50
Due Date: February 9, 2016
`;

async function main(): Promise<void> {
  console.log("=== Gemini Invoice Extraction Test ===\n");

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY environment variable");
    console.error("Please set it in .env.local and try again.");
    process.exit(1);
  }

  console.log("Input text length:", SAMPLE_RAW_TEXT.length, "characters\n");
  console.log("Extracting invoice data with Gemini...\n");

  const result = await extractInvoiceWithGemini(SAMPLE_RAW_TEXT);

  console.log("=== Extraction Results ===\n");
  console.log("Vendor:", result.vendor);
  console.log("Invoice Number:", result.invoice_number);
  console.log("Invoice Date:", result.invoice_date);
  console.log("Due Date:", result.due_date);
  console.log("Subtotal:", result.subtotal);
  console.log("Tax:", result.tax);
  console.log("Total:", result.total);
  console.log("Confidence:", (result.confidence * 100).toFixed(1) + "%");

  if (result.line_items.length > 0) {
    console.log("\n=== Line Items ===\n");
    result.line_items.forEach((item, index) => {
      console.log(`Item ${index + 1}:`);
      console.log(`  Description: ${item.description}`);
      console.log(`  Quantity: ${item.quantity}`);
      console.log(`  Unit Price: ${item.unit_price}`);
      console.log(`  Amount: ${item.amount}`);
    });
  }

  console.log("\n=== Validation ===\n");

  // Validate expected values
  const vendorMatch = result.vendor === "DEMO - Sliced Invoices";
  const totalMatch = result.total === 93.5;

  console.log(
    `Vendor is "DEMO - Sliced Invoices": ${vendorMatch ? "PASS" : "FAIL"} (got: ${result.vendor})`
  );
  console.log(
    `Total is 93.50: ${totalMatch ? "PASS" : "FAIL"} (got: ${result.total})`
  );

  if (!vendorMatch || !totalMatch) {
    console.log("\n=== Raw Response (for debugging) ===\n");
    console.log(result.raw_response);
  }

  console.log("\n=== Test Complete ===");

  // Exit with error code if validation failed
  if (!vendorMatch || !totalMatch) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
