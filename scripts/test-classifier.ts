import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { classifyDocument } from "../lib/gemini/classify-document.js";

// Sample texts for testing classification
const SAMPLE_INVOICE_TEXT = `DEMO - Sliced Invoices
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

const SAMPLE_BANK_STATEMENT_TEXT = `FIRST NATIONAL BANK
Account Statement
Statement Period: January 1, 2024 - January 31, 2024

Account Holder: John Smith
Account Number: ****4567
Account Type: Checking

Opening Balance: $5,432.10

TRANSACTIONS:
Date        Description                 Withdrawal    Deposit    Balance
01/02/24    Direct Deposit - Payroll                  $3,500.00  $8,932.10
01/05/24    Check #1234                 $250.00                  $8,682.10
01/08/24    Debit Card - Grocery Store  $156.78                  $8,525.32
01/15/24    Transfer to Savings         $1,000.00                $7,525.32
01/20/24    ATM Withdrawal              $200.00                  $7,325.32
01/25/24    Utility Payment             $145.00                  $7,180.32

Closing Balance: $7,180.32

For questions, call 1-800-555-BANK
`;

const SAMPLE_CONTRACT_TEXT = `SERVICES AGREEMENT

This Services Agreement ("Agreement") is entered into as of March 1, 2024 ("Effective Date")

BETWEEN:
ABC Consulting LLC ("Provider")
123 Business Park Drive, Suite 100
San Francisco, CA 94105

AND:
XYZ Corporation ("Client")
456 Enterprise Way
New York, NY 10001

1. SERVICES
Provider agrees to provide consulting services as described in Exhibit A attached hereto.

2. TERM
This Agreement shall commence on the Effective Date and continue for a period of twelve (12) months unless earlier terminated.

3. COMPENSATION
Client shall pay Provider a monthly fee of $5,000 for the services rendered.

4. CONFIDENTIALITY
Both parties agree to maintain confidentiality of all proprietary information.

5. TERMINATION
Either party may terminate this Agreement with 30 days written notice.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

_____________________          _____________________
Provider Signature             Client Signature
`;

interface TestCase {
  name: string;
  text: string;
  expectedType: string;
}

const testCases: TestCase[] = [
  { name: "Invoice", text: SAMPLE_INVOICE_TEXT, expectedType: "invoice" },
  { name: "Bank Statement", text: SAMPLE_BANK_STATEMENT_TEXT, expectedType: "bank_statement" },
  { name: "Contract", text: SAMPLE_CONTRACT_TEXT, expectedType: "contract" },
];

async function main(): Promise<void> {
  console.log("=== Document Classifier Test ===\n");

  // Check for API key
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY environment variable");
    console.error("Please set it in .env.local and try again.");
    process.exit(1);
  }

  const results: Array<{ name: string; expected: string; actual: string; confidence: number; pass: boolean }> = [];

  for (const testCase of testCases) {
    console.log(`\n--- Testing: ${testCase.name} ---`);
    console.log(`Text preview: ${testCase.text.slice(0, 100).replace(/\n/g, " ")}...`);

    const result = await classifyDocument(testCase.text);

    console.log(`\nClassification: ${result.documentType}`);
    console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`Reasoning: ${result.reasoning}`);

    const pass = result.documentType === testCase.expectedType;
    results.push({
      name: testCase.name,
      expected: testCase.expectedType,
      actual: result.documentType,
      confidence: result.confidence,
      pass,
    });
  }

  // Print summary
  console.log("\n=== Summary ===\n");
  console.log("Test Case          | Expected        | Actual          | Confidence | Result");
  console.log("-------------------|-----------------|-----------------|------------|-------");

  for (const r of results) {
    const name = r.name.padEnd(18);
    const expected = r.expected.padEnd(15);
    const actual = r.actual.padEnd(15);
    const confidence = `${(r.confidence * 100).toFixed(0)}%`.padStart(10);
    const result = r.pass ? "PASS" : "FAIL";
    console.log(`${name} | ${expected} | ${actual} | ${confidence} | ${result}`);
  }

  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\nPassed: ${passed}/${total}`);

  // Validate invoice specifically
  const invoiceTest = results.find((r) => r.name === "Invoice");
  if (invoiceTest && !invoiceTest.pass) {
    console.error("\nCRITICAL: Invoice classification failed!");
    process.exit(1);
  }

  if (passed === total) {
    console.log("\n=== All Tests Passed ===");
  } else {
    console.log("\n=== Some Tests Failed ===");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
