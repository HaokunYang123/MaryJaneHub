import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  getTokens,
  isConnected,
  getCompanyInfo,
  getVendors,
  findVendorByName,
  findOrCreateVendor,
  createBill,
  getExpenseAccounts,
  convertInvoiceToBill,
  canConvertToBill,
} from "../lib/quickbooks/index.js";
import type { InvoiceExtraction } from "../lib/gemini/types.js";

/**
 * Mock invoice extraction for testing
 */
const MOCK_INVOICE: InvoiceExtraction = {
  vendor: "Test Vendor LLC",
  invoice_number: "INV-2024-TEST-001",
  invoice_date: "2024-01-15",
  due_date: "2024-02-15",
  subtotal: 850.0,
  tax: 70.13,
  total: 920.13,
  line_items: [
    {
      description: "Consulting Services - January 2024",
      quantity: 10,
      unit_price: 75.0,
      amount: 750.0,
    },
    {
      description: "Software License",
      quantity: 1,
      unit_price: 100.0,
      amount: 100.0,
    },
  ],
  confidence: 0.95,
  raw_response: "",
};

async function main(): Promise<void> {
  console.log("=== QuickBooks API Test ===\n");

  // Check required environment variables
  const requiredEnvVars = [
    "QB_CLIENT_ID",
    "QB_CLIENT_SECRET",
    "QB_REDIRECT_URI",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
  ];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.error("Missing required environment variables:");
    missingVars.forEach((v) => console.error(`  - ${v}`));
    console.error("\nPlease set these in .env.local and try again.");
    process.exit(1);
  }

  // Check if connected to QuickBooks
  console.log("[1] Checking QuickBooks connection...");
  const connected = await isConnected();

  if (!connected) {
    console.log("\nQuickBooks is not connected.");
    console.log("Please visit /api/quickbooks/connect to authorize first.");
    console.log("\nTo test without real API calls, run with --mock flag.");

    if (!process.argv.includes("--mock")) {
      process.exit(0);
    }

    console.log("\nRunning in mock mode...\n");
    testMockConversion();
    return;
  }

  const tokens = await getTokens();
  console.log(`  Connected to QuickBooks`);
  console.log(`  Realm ID: ${tokens?.realm_id}`);
  console.log(`  Token expires: ${tokens?.expires_at}`);

  // Test getCompanyInfo
  console.log("\n[2] Getting company info...");
  try {
    const companyInfo = await getCompanyInfo();
    console.log(`  Company Name: ${companyInfo.CompanyName}`);
    console.log(`  Legal Name: ${companyInfo.LegalName || "(not set)"}`);
    console.log(`  Country: ${companyInfo.Country || "(not set)"}`);
  } catch (error) {
    console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
  }

  // Test getVendors
  console.log("\n[3] Getting vendors...");
  try {
    const vendors = await getVendors();
    console.log(`  Found ${vendors.length} vendor(s)`);
    if (vendors.length > 0) {
      console.log("  First 5 vendors:");
      vendors.slice(0, 5).forEach((v) => {
        console.log(`    - ${v.DisplayName} (ID: ${v.Id}, Balance: $${v.Balance})`);
      });
    }
  } catch (error) {
    console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
  }

  // Test getExpenseAccounts
  console.log("\n[4] Getting expense accounts...");
  let defaultExpenseAccountId: string | undefined;
  try {
    const accounts = await getExpenseAccounts();
    console.log(`  Found ${accounts.length} expense account(s)`);
    if (accounts.length > 0) {
      console.log("  First 5 accounts:");
      accounts.slice(0, 5).forEach((a) => {
        console.log(`    - ${a.Name} (ID: ${a.Id})`);
      });
      defaultExpenseAccountId = accounts[0].Id;
    }
  } catch (error) {
    console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
  }

  // Test findVendorByName
  console.log("\n[5] Finding vendor by name...");
  try {
    const searchName = "Test";
    console.log(`  Searching for: "${searchName}"`);
    const vendor = await findVendorByName(searchName);
    if (vendor) {
      console.log(`  Found: ${vendor.DisplayName} (ID: ${vendor.Id})`);
    } else {
      console.log(`  No vendor found matching "${searchName}"`);
    }
  } catch (error) {
    console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
  }

  // Test invoice to bill conversion (validation only, no API call)
  console.log("\n[6] Testing invoice to bill conversion...");
  testMockConversion();

  // Test createBill (only if --create-bill flag is passed)
  if (process.argv.includes("--create-bill")) {
    console.log("\n[7] Creating test bill in QuickBooks...");

    if (!defaultExpenseAccountId) {
      console.log("  SKIP: No expense account found");
    } else {
      try {
        // Find or create test vendor
        console.log("  Finding/creating test vendor...");
        const vendor = await findOrCreateVendor({
          displayName: MOCK_INVOICE.vendor!,
        });
        console.log(`  Vendor: ${vendor.DisplayName} (ID: ${vendor.Id})`);

        // Convert invoice to bill
        const billInput = convertInvoiceToBill(
          MOCK_INVOICE,
          vendor.Id,
          vendor.DisplayName,
          defaultExpenseAccountId
        );

        console.log("  Creating bill...");
        const bill = await createBill(billInput);
        console.log(`  Bill created successfully!`);
        console.log(`    Bill ID: ${bill.Id}`);
        console.log(`    Doc Number: ${bill.DocNumber}`);
        console.log(`    Total: $${bill.TotalAmt}`);
        console.log(`    Lines: ${bill.Line.length}`);
      } catch (error) {
        console.error(`  ERROR: ${error instanceof Error ? error.message : error}`);
      }
    }
  } else {
    console.log("\n[7] SKIP: Bill creation");
    console.log("  Run with --create-bill flag to test bill creation in QuickBooks");
  }

  console.log("\n=== Test Complete ===");
}

/**
 * Test invoice to bill conversion without API calls
 */
function testMockConversion(): void {
  console.log("  Mock Invoice:");
  console.log(`    Vendor: ${MOCK_INVOICE.vendor}`);
  console.log(`    Invoice #: ${MOCK_INVOICE.invoice_number}`);
  console.log(`    Date: ${MOCK_INVOICE.invoice_date}`);
  console.log(`    Total: $${MOCK_INVOICE.total}`);
  console.log(`    Line Items: ${MOCK_INVOICE.line_items.length}`);

  // Validate conversion
  const validation = canConvertToBill(MOCK_INVOICE);
  console.log(`\n  Validation: ${validation.valid ? "PASS" : "FAIL"}`);
  if (!validation.valid) {
    validation.errors.forEach((e) => console.log(`    - ${e}`));
  }

  // Convert to bill format
  const billInput = convertInvoiceToBill(MOCK_INVOICE, "mock-vendor-id", "Test Vendor LLC", "mock-account-id");
  console.log("\n  Converted Bill Input:");
  console.log(`    Vendor ID: ${billInput.vendorId}`);
  console.log(`    Txn Date: ${billInput.txnDate}`);
  console.log(`    Due Date: ${billInput.dueDate}`);
  console.log(`    Doc Number: ${billInput.docNumber}`);
  console.log(`    Lines: ${billInput.lines.length}`);
  billInput.lines.forEach((line, i) => {
    console.log(`      ${i + 1}. $${line.amount.toFixed(2)} - ${line.description}`);
  });
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
