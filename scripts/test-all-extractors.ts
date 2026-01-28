import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { classifyDocument } from "../lib/gemini/classify-document.js";
import { extractDocument, type DocumentExtraction } from "../lib/gemini/extract-document.js";
import type { DocumentType } from "../lib/gemini/document-types.js";

/**
 * Sample OCR text for each document type
 */
const SAMPLE_TEXTS: Record<DocumentType, string> = {
  invoice: `
INVOICE

From: Acme Web Services LLC
123 Tech Boulevard, Suite 400
San Francisco, CA 94105
Email: billing@acmewebservices.com

Bill To:
Johnson & Partners Inc.
456 Business Park Drive
Austin, TX 78701

Invoice Number: INV-2024-0892
Invoice Date: January 15, 2024
Due Date: February 14, 2024
Payment Terms: Net 30

Description                          Qty    Unit Price    Amount
-----------------------------------------------------------------
Website Development - Phase 1          1     $5,000.00   $5,000.00
Monthly Hosting (Jan 2024)             1       $150.00     $150.00
SSL Certificate (Annual)               1        $99.00      $99.00
Technical Support Hours               10        $75.00     $750.00

                                      Subtotal:          $5,999.00
                                      Tax (8.25%):         $494.92
                                      TOTAL DUE:         $6,493.92

Payment Methods:
- Bank Transfer: Chase Bank, Account ending 4521
- Credit Card: Via our payment portal

Thank you for your business!
`,

  bank_statement: `
FIRST NATIONAL BANK
Monthly Statement

Account Holder: Sarah M. Thompson
Account Number: ****4892
Statement Period: December 1, 2023 - December 31, 2023

ACCOUNT SUMMARY
-----------------------------------------
Opening Balance (Dec 1):        $12,450.67
Total Deposits:                  $8,500.00
Total Withdrawals:              $6,234.89
Closing Balance (Dec 31):       $14,715.78

TRANSACTION DETAILS
-----------------------------------------
Date        Description                    Amount      Balance
Dec 02      DIRECT DEPOSIT - EMPLOYER     +$4,250.00  $16,700.67
Dec 05      RENT PAYMENT - APT 302        -$1,850.00  $14,850.67
Dec 08      WHOLE FOODS MARKET            -$156.32    $14,694.35
Dec 10      TRANSFER FROM SAVINGS         +$500.00    $15,194.35
Dec 12      ELECTRIC COMPANY              -$134.56    $15,059.79
Dec 15      ATM WITHDRAWAL                -$200.00    $14,859.79
Dec 16      DIRECT DEPOSIT - EMPLOYER     +$4,250.00  $19,109.79
Dec 18      CAR INSURANCE - PROGRESSIVE   -$245.00    $18,864.79
Dec 20      AMAZON.COM                    -$89.99     $18,774.80
Dec 22      GAS STATION                   -$58.45     $18,716.35
Dec 24      TARGET STORES                 -$234.67    $18,481.68
Dec 28      NETFLIX SUBSCRIPTION          -$15.99     $18,465.69
Dec 29      CREDIT CARD PAYMENT           -$2,500.00  $15,965.69
Dec 30      PHONE BILL - VERIZON          -$89.91     $15,875.78
Dec 31      INTEREST EARNED               +$0.00      $14,715.78

Questions? Call 1-800-555-BANK
`,

  receipt: `
================================
        TRADER JOE'S
    1234 Market Street
   Portland, OR 97205
   Tel: (503) 555-0123
================================
Date: 01/20/2024  Time: 14:32
Cashier: MIKE  Register: 03
================================

Organic Bananas           $0.99
Sourdough Bread           $4.49
Almond Milk 64oz          $3.79
Greek Yogurt 32oz         $5.99
Cage Free Eggs            $4.99
Chicken Breast 1.5lb      $8.97
Basmati Rice 2lb          $4.49
Olive Oil 500ml           $7.99
Mixed Greens              $3.99
Cherry Tomatoes           $3.49
Avocados (3pk)            $4.99
Cheddar Cheese            $4.29
--------------------------------
SUBTOTAL                 $58.46
TAX (0%)                  $0.00
--------------------------------
TOTAL                    $58.46

VISA ************4521
AUTH: 847291

================================
 Thank you for shopping at
      Trader Joe's!
   Save receipt for returns
================================
`,

  contract: `
SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of March 1, 2024 ("Effective Date")

BETWEEN:

CloudTech Solutions Inc.
A Delaware Corporation
500 Innovation Drive
Seattle, WA 98101
("Service Provider")

AND:

Riverside Manufacturing Co.
A California Corporation
789 Industrial Way
Los Angeles, CA 90015
("Client")

RECITALS:
The Service Provider agrees to provide cloud infrastructure services to the Client under the terms and conditions set forth herein.

1. SERVICES
The Service Provider shall provide managed cloud hosting, data backup, and 24/7 technical support services as described in Exhibit A.

2. TERM
This Agreement shall commence on the Effective Date and continue for a period of twenty-four (24) months, unless earlier terminated pursuant to Section 8.

3. COMPENSATION
Client shall pay Service Provider $15,000 per month for the services rendered. Payment is due within 30 days of invoice date.

4. CONFIDENTIALITY
Both parties agree to maintain strict confidentiality of all proprietary information exchanged during the term of this Agreement.

5. LIMITATION OF LIABILITY
Neither party shall be liable for indirect, incidental, or consequential damages exceeding the total fees paid in the preceding 12 months.

6. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Washington.

7. TERMINATION
Either party may terminate this Agreement with 90 days written notice. Immediate termination is permitted for material breach.

8. ENTIRE AGREEMENT
This Agreement constitutes the entire understanding between the parties.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

CloudTech Solutions Inc.          Riverside Manufacturing Co.
By: _______________________       By: _______________________
Name: Jennifer Walsh              Name: Robert Chen
Title: CEO                        Title: CFO
Date: March 1, 2024              Date: March 1, 2024
`,

  tax_form: `
Form W-2 Wage and Tax Statement 2023

a Employee's social security number: ***-**-6789

b Employer identification number (EIN): 94-3456789

c Employer's name, address, and ZIP code:
   TechStart Innovations Inc.
   2000 Technology Parkway
   Palo Alto, CA 94301

d Control number: 2023-W2-00456

e Employee's first name and initial: Michael J.
   Last name: Anderson
   Suffix:

f Employee's address and ZIP code:
   1456 Oak Avenue, Apt 12B
   Mountain View, CA 94043

1  Wages, tips, other compensation:     $125,000.00
2  Federal income tax withheld:          $28,750.00
3  Social security wages:               $160,200.00
4  Social security tax withheld:          $9,932.40
5  Medicare wages and tips:             $125,000.00
6  Medicare tax withheld:                 $1,812.50
7  Social security tips:                      $0.00
8  Allocated tips:                            $0.00

10 Dependent care benefits:                   $0.00
11 Nonqualified plans:                        $0.00
12a Code: D  Amount: $22,500.00  (401k)
12b Code: DD Amount: $8,400.00   (Health)
12c Code:    Amount:
12d Code:    Amount:

13 [X] Statutory employee  [ ] Retirement plan  [ ] Third-party sick pay

14 Other:
   CA SDI: $1,378.48

15 State: CA    Employer's state ID: 123-4567-8
16 State wages, tips, etc.: $125,000.00
17 State income tax: $9,500.00

Copy B - To Be Filed With Employee's FEDERAL Tax Return
`,

  correspondence: `
RIVERSIDE LEGAL ASSOCIATES
Attorneys at Law
500 Justice Boulevard, Suite 1200
Chicago, IL 60601
Tel: (312) 555-8900 | Fax: (312) 555-8901

January 25, 2024

VIA CERTIFIED MAIL

Mr. David Patterson
Patterson Real Estate Holdings LLC
1500 Commerce Center Drive
Chicago, IL 60654

Re: Lease Renewal - 500 Michigan Avenue, Suite 800
    Our File No.: RLA-2024-0156

Dear Mr. Patterson:

We are writing on behalf of our client, Metropolitan Office Solutions Inc., regarding the upcoming lease renewal for the above-referenced property.

As you are aware, the current lease term expires on April 30, 2024. Our client wishes to exercise its option to renew the lease for an additional five-year term, as provided in Section 12.3 of the existing Lease Agreement dated May 1, 2019.

Please note the following important matters that require your immediate attention:

1. RENEWAL TERMS: Our client requests confirmation of the renewal rate of $45 per square foot, as stipulated in the renewal option clause.

2. TENANT IMPROVEMENTS: Our client intends to request approval for minor modifications to the HVAC system, estimated at $25,000.

3. PARKING ALLOCATION: We request an additional 10 parking spaces be added to the current allocation of 50 spaces.

Please respond to this letter no later than February 15, 2024, to confirm receipt and provide your preliminary response to these requests.

Should you have any questions, please do not hesitate to contact the undersigned at (312) 555-8920.

Very truly yours,

RIVERSIDE LEGAL ASSOCIATES


Elizabeth M. Torres
Senior Partner

EMT/jkl
Enclosures: Lease Agreement (Copy), Renewal Option Clause
cc: Metropolitan Office Solutions Inc. (via email)
`,

  other: `
MEMORANDUM

TO: All Department Heads
FROM: Human Resources
DATE: February 1, 2024
RE: Updated Office Procedures

This memo serves to inform all staff of the following updates to our office procedures effective February 15, 2024.

1. Building Access Hours
   - Standard hours: 7:00 AM - 8:00 PM Monday through Friday
   - Weekend access requires supervisor approval

2. Meeting Room Reservations
   - All conference rooms must be booked through the new scheduling system
   - Maximum booking duration: 2 hours

3. Parking Lot Changes
   - Visitor parking has been relocated to Lot B
   - Employee parking remains in Lots A and C

Please direct any questions to HR at extension 2500.
`,
};

/**
 * Test result for a single document type
 */
interface TestResult {
  documentType: DocumentType;
  classificationResult: {
    detectedType: DocumentType;
    confidence: number;
    correct: boolean;
  };
  extractionResult: {
    success: boolean;
    confidence: number;
    extractedType: string;
    sampleFields: Record<string, unknown>;
    error?: string;
  };
}

/**
 * Test a single document type
 */
async function testDocumentType(
  expectedType: DocumentType,
  sampleText: string
): Promise<TestResult> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing: ${expectedType.toUpperCase()}`);
  console.log("=".repeat(60));

  // Step 1: Classification
  console.log("\n[1] Classifying document...");
  let classificationResult: TestResult["classificationResult"];

  try {
    const classification = await classifyDocument(sampleText);
    const correct = classification.documentType === expectedType;
    classificationResult = {
      detectedType: classification.documentType,
      confidence: classification.confidence,
      correct,
    };
    console.log(
      `    Type: ${classification.documentType} (expected: ${expectedType}) - ${correct ? "CORRECT" : "MISMATCH"}`
    );
    console.log(`    Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.log(`    ERROR: ${errorMsg}`);
    classificationResult = {
      detectedType: "other",
      confidence: 0,
      correct: false,
    };
  }

  // Step 2: Extraction
  console.log("\n[2] Extracting structured data...");
  let extractionResult: TestResult["extractionResult"];

  try {
    const extraction = await extractDocument(expectedType, sampleText);
    const sampleFields = getSampleFields(extraction);

    extractionResult = {
      success: true,
      confidence: extraction.data.confidence,
      extractedType: extraction.type,
      sampleFields,
    };

    console.log(`    Type: ${extraction.type}`);
    console.log(`    Confidence: ${(extraction.data.confidence * 100).toFixed(1)}%`);
    console.log(`    Sample fields:`);
    Object.entries(sampleFields).forEach(([key, value]) => {
      console.log(`      - ${key}: ${JSON.stringify(value)}`);
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.log(`    ERROR: ${errorMsg}`);
    extractionResult = {
      success: false,
      confidence: 0,
      extractedType: "unknown",
      sampleFields: {},
      error: errorMsg,
    };
  }

  return {
    documentType: expectedType,
    classificationResult,
    extractionResult,
  };
}

/**
 * Extract sample fields from extraction result for display
 */
function getSampleFields(extraction: DocumentExtraction): Record<string, unknown> {
  switch (extraction.type) {
    case "invoice":
      return {
        vendor: extraction.data.vendor,
        invoice_number: extraction.data.invoice_number,
        total: extraction.data.total,
        line_items_count: extraction.data.line_items.length,
      };
    case "bank_statement":
      return {
        bank_name: extraction.data.bank_name,
        account_last4: extraction.data.account_number_last4,
        opening_balance: extraction.data.opening_balance,
        closing_balance: extraction.data.closing_balance,
        transactions_count: extraction.data.transactions?.length ?? 0,
      };
    case "receipt":
      return {
        merchant_name: extraction.data.merchant_name,
        date: extraction.data.date,
        total: extraction.data.total,
        items_count: extraction.data.items?.length ?? 0,
      };
    case "contract":
      return {
        contract_type: extraction.data.contract_type,
        parties_count: extraction.data.parties?.length ?? 0,
        effective_date: extraction.data.effective_date,
        value: extraction.data.value,
        governing_law: extraction.data.governing_law,
      };
    case "tax_form":
      return {
        form_type: extraction.data.form_type,
        tax_year: extraction.data.tax_year,
        entity_name: extraction.data.entity_name,
        total_income: extraction.data.total_income,
        total_tax: extraction.data.total_tax,
      };
    case "correspondence":
      return {
        sender: extraction.data.sender,
        recipient: extraction.data.recipient,
        date: extraction.data.date,
        subject: extraction.data.subject,
        action_items_count: extraction.data.action_items?.length ?? 0,
      };
    case "other":
    default:
      return {
        vendor: extraction.data.vendor,
        total: extraction.data.total,
      };
  }
}

/**
 * Print summary of all test results
 */
function printSummary(results: TestResult[]): void {
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  const classificationCorrect = results.filter((r) => r.classificationResult.correct).length;
  const extractionSuccess = results.filter((r) => r.extractionResult.success).length;

  console.log(`\nClassification: ${classificationCorrect}/${results.length} correct`);
  console.log(`Extraction: ${extractionSuccess}/${results.length} successful`);

  console.log("\nDetailed Results:");
  console.log("-".repeat(60));
  console.log(
    "Type".padEnd(20) +
      "Classification".padEnd(20) +
      "Extraction".padEnd(20)
  );
  console.log("-".repeat(60));

  results.forEach((r) => {
    const classStatus = r.classificationResult.correct
      ? `PASS (${(r.classificationResult.confidence * 100).toFixed(0)}%)`
      : `FAIL (got ${r.classificationResult.detectedType})`;
    const extractStatus = r.extractionResult.success
      ? `PASS (${(r.extractionResult.confidence * 100).toFixed(0)}%)`
      : "FAIL";

    console.log(
      r.documentType.padEnd(20) +
        classStatus.padEnd(20) +
        extractStatus.padEnd(20)
    );
  });

  console.log("-".repeat(60));

  const allPassed =
    classificationCorrect === results.length &&
    extractionSuccess === results.length;

  console.log(
    `\nOverall: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`
  );

  if (!allPassed) {
    process.exit(1);
  }
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  console.log("=== Multi-Document Type Extractor Test ===\n");

  // Check for required environment variables
  if (!process.env.GEMINI_API_KEY) {
    console.error("Missing GEMINI_API_KEY environment variable");
    console.error("Please set it in .env.local and try again.");
    process.exit(1);
  }

  const documentTypes: DocumentType[] = [
    "invoice",
    "bank_statement",
    "receipt",
    "contract",
    "tax_form",
    "correspondence",
  ];

  const results: TestResult[] = [];

  for (const docType of documentTypes) {
    const result = await testDocumentType(docType, SAMPLE_TEXTS[docType]);
    results.push(result);

    // Small delay between API calls to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  printSummary(results);

  console.log("\n=== Test Complete ===");
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
