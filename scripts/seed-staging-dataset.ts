#!/usr/bin/env npx tsx
/**
 * Seed a minimal staging dataset for assistant integration tests.
 *
 * Creates deterministic PDF fixtures (if missing) and inserts matching
 * documents into Supabase with predictable vendor/type/year values.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { createHash } from "crypto";

import { saveDocument } from "../lib/supabase/documents";
import { generateAndStoreEmbedding } from "../lib/search/semantic-search";
import type { DocumentExtraction } from "../lib/gemini/extract-document";
import type { LineItem } from "../lib/gemini/types";
import type { ReceiptItem } from "../lib/gemini/extract-receipt";

const FIXTURE_DIR = "test-files/staging-fixtures";
const REQUIRED_ENV = ["SUPABASE_URL", "GEMINI_API_KEY"];
const FORCE = process.env.ASSISTANT_SEED === "1";

type FixtureBase = {
  fileName: string;
  vendor: string;
  date: string; // YYYY-MM-DD
  total: number;
};

type InvoiceFixture = FixtureBase & {
  documentType: "invoice";
  invoiceNumber: string;
  dueDate: string;
  subtotal: number;
  tax: number;
  lineItems: LineItem[];
};

type ReceiptFixture = FixtureBase & {
  documentType: "receipt";
  paymentMethod: string;
  subtotal: number;
  tax: number;
  tip: number;
  items: ReceiptItem[];
};

type Fixture = InvoiceFixture | ReceiptFixture;

const FIXTURES: Fixture[] = [
  {
    fileName: "2024-01-19-bega-invoice.pdf",
    documentType: "invoice",
    vendor: "Bega",
    invoiceNumber: "BGA-001",
    date: "2024-01-19",
    dueDate: "2024-02-18",
    subtotal: 1150.0,
    tax: 100.5,
    total: 1250.5,
    lineItems: [
      { description: "Staging seed materials", quantity: 1, unit_price: 1150.0, amount: 1150.0 },
    ],
  },
  {
    fileName: "2024-02-05-bega-invoice.pdf",
    documentType: "invoice",
    vendor: "Bega",
    invoiceNumber: "BGA-002",
    date: "2024-02-05",
    dueDate: "2024-03-06",
    subtotal: 780.0,
    tax: 65.25,
    total: 845.25,
    lineItems: [
      { description: "Staging seed services", quantity: 1, unit_price: 780.0, amount: 780.0 },
    ],
  },
  {
    fileName: "2024-03-10-fedex-invoice.pdf",
    documentType: "invoice",
    vendor: "FedEx",
    invoiceNumber: "FDX-1001",
    date: "2024-03-10",
    dueDate: "2024-04-09",
    subtotal: 200.0,
    tax: 30.0,
    total: 230.0,
    lineItems: [
      { description: "Shipping services", quantity: 1, unit_price: 200.0, amount: 200.0 },
    ],
  },
  {
    fileName: "2024-04-15-centerpointe-invoice.pdf",
    documentType: "invoice",
    vendor: "Centerpointe",
    invoiceNumber: "CP-778",
    date: "2024-04-15",
    dueDate: "2024-05-15",
    subtotal: 1550.0,
    tax: 140.0,
    total: 1690.0,
    lineItems: [
      { description: "Printing services", quantity: 1, unit_price: 1550.0, amount: 1550.0 },
    ],
  },
  {
    fileName: "2024-05-02-fedex-receipt.pdf",
    documentType: "receipt",
    vendor: "FedEx",
    date: "2024-05-02",
    paymentMethod: "credit",
    subtotal: 40.0,
    tax: 4.1,
    tip: 0,
    total: 44.1,
    items: [
      { description: "Shipping label", quantity: 1, unit_price: 40.0, amount: 40.0 },
    ],
  },
  {
    fileName: "2024-06-20-office-receipt.pdf",
    documentType: "receipt",
    vendor: "OfficeSupply",
    date: "2024-06-20",
    paymentMethod: "credit",
    subtotal: 82.0,
    tax: 7.99,
    tip: 0,
    total: 89.99,
    items: [
      { description: "Printer paper", quantity: 2, unit_price: 20.0, amount: 40.0 },
      { description: "Ink cartridges", quantity: 1, unit_price: 42.0, amount: 42.0 },
    ],
  },
];

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfBuffer(lines: string[]): Buffer {
  const contentLines: string[] = ["BT", "/F1 12 Tf", "72 720 Td"];
  lines.forEach((line, index) => {
    if (index > 0) contentLines.push("0 -16 Td");
    contentLines.push(`(${escapePdfText(line)}) Tj`);
  });
  contentLines.push("ET");
  const content = contentLines.join("\n");

  const objects: string[] = [];
  objects[1] = "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj";
  objects[2] = "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj";
  objects[3] = "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj";
  objects[4] = `4 0 obj << /Length ${Buffer.byteLength(content, "utf8")} >> stream\n${content}\nendstream endobj`;
  objects[5] = "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += objects[i] + "\n";
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) {
    const offset = String(offsets[i]).padStart(10, "0");
    pdf += `${offset} 00000 n \n`;
  }
  pdf += `trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}

function buildInvoiceRawText(fixture: InvoiceFixture): string[] {
  return [
    "INVOICE",
    `Vendor: ${fixture.vendor}`,
    `Invoice Number: ${fixture.invoiceNumber}`,
    `Invoice Date: ${fixture.date}`,
    `Due Date: ${fixture.dueDate}`,
    `Subtotal: $${fixture.subtotal.toFixed(2)}`,
    `Tax: $${fixture.tax.toFixed(2)}`,
    `Total: $${fixture.total.toFixed(2)}`,
  ];
}

function buildReceiptRawText(fixture: ReceiptFixture): string[] {
  return [
    "RECEIPT",
    `Merchant: ${fixture.vendor}`,
    `Date: ${fixture.date}`,
    `Subtotal: $${fixture.subtotal.toFixed(2)}`,
    `Tax: $${fixture.tax.toFixed(2)}`,
    `Total: $${fixture.total.toFixed(2)}`,
    `Payment Method: ${fixture.paymentMethod}`,
  ];
}

function buildExtraction(fixture: Fixture): DocumentExtraction {
  if (fixture.documentType === "invoice") {
    return {
      type: "invoice",
      data: {
        vendor: fixture.vendor,
        invoice_number: fixture.invoiceNumber,
        invoice_date: fixture.date,
        due_date: fixture.dueDate,
        subtotal: fixture.subtotal,
        tax: fixture.tax,
        total: fixture.total,
        line_items: fixture.lineItems,
        confidence: 1,
        raw_response: "seeded",
      },
    };
  }

  return {
    type: "receipt",
    data: {
      merchant_name: fixture.vendor,
      date: fixture.date,
      total: fixture.total,
      payment_method: fixture.paymentMethod,
      items: fixture.items,
      subtotal: fixture.subtotal,
      tax: fixture.tax,
      tip: fixture.tip,
      confidence: 1,
      raw_response: "seeded",
    },
  };
}

async function ensureFixtureFiles(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });

  for (const fixture of FIXTURES) {
    const filePath = path.join(FIXTURE_DIR, fixture.fileName);
    if (existsSync(filePath)) {
      continue;
    }

    const lines =
      fixture.documentType === "invoice"
        ? buildInvoiceRawText(fixture)
        : buildReceiptRawText(fixture);

    const buffer = buildPdfBuffer(lines);
    await writeFile(filePath, buffer);
  }
}

function resolveSupabaseKey(): { name: string; value: string } | null {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { name: "SUPABASE_SERVICE_ROLE_KEY", value: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  if (process.env.SUPABASE_SERVICE_KEY) {
    return { name: "SUPABASE_SERVICE_KEY", value: process.env.SUPABASE_SERVICE_KEY };
  }
  return null;
}

function getSupabaseHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

function shouldSkipSeed(reason: string): never {
  if (FORCE) {
    console.error(reason);
    process.exit(1);
  }
  console.log("SKIP (seed gating)");
  console.log(`  - ${reason}`);
  process.exit(0);
}

async function main(): Promise<void> {
  await ensureFixtureFiles();

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    const message = `Missing required environment variables: ${missing.join(", ")}`;
    return shouldSkipSeed(message);
  }

  const key = resolveSupabaseKey();
  if (!key) {
    return shouldSkipSeed("Missing Supabase service key (SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY)");
  }

  console.log(`Using Supabase key: ${key.name}`);

  const supabaseUrl = process.env.SUPABASE_URL!;
  console.log(`Supabase host: ${getSupabaseHost(supabaseUrl)}`);

  const allowProd = process.env.ASSISTANT_SEED_ALLOW_PROD === "1";
  if (allowProd) {
    console.warn("WARNING: ASSISTANT_SEED_ALLOW_PROD=1 set. Seeding may affect production data.");
    if (process.env.ASSISTANT_SEED_CONFIRM !== "YES" || process.env.ASSISTANT_SEED_CONFIRM_2 !== "YES") {
      return shouldSkipSeed("Missing double confirmation (ASSISTANT_SEED_CONFIRM=YES and ASSISTANT_SEED_CONFIRM_2=YES)");
    }
  } else {
    if (process.env.ASSISTANT_SEED_ENV !== "staging") {
      return shouldSkipSeed("ASSISTANT_SEED_ENV must be set to 'staging' to seed without prod override");
    }
    if (process.env.ASSISTANT_SEED_CONFIRM !== "YES") {
      return shouldSkipSeed("Missing confirmation (ASSISTANT_SEED_CONFIRM=YES)");
    }
  }

  if (!process.env.SUPABASE_SERVICE_KEY) {
    process.env.SUPABASE_SERVICE_KEY = key.value;
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = key.value;
  }

  console.log("Seeding staging dataset...");
  console.log(`Fixture folder: ${FIXTURE_DIR}`);

  const results: Array<{
    fileName: string;
    documentId?: string;
    alreadyExists?: boolean;
    error?: string;
  }> = [];

  for (const fixture of FIXTURES) {
    const filePath = path.join(FIXTURE_DIR, fixture.fileName);
    const buffer = await readFile(filePath);
    const fileHash = createHash("sha256").update(buffer).digest("hex");
    const rawLines =
      fixture.documentType === "invoice"
        ? buildInvoiceRawText(fixture)
        : buildReceiptRawText(fixture);
    const rawText = rawLines.join("\n");
    const extraction = buildExtraction(fixture);

    const saveResult = await saveDocument({
      fileName: fixture.fileName,
      fileHash,
      mimeType: "application/pdf",
      ocrConfidence: 1,
      rawText,
      extraction,
      documentType: fixture.documentType,
      classificationConfidence: 1,
      syncStatus: "not_applicable",
      confidenceScore: 1,
      reviewFlags: [],
    });

    if (!saveResult.success) {
      results.push({ fileName: fixture.fileName, error: saveResult.error });
      continue;
    }

    if (!saveResult.alreadyExists && saveResult.documentId) {
      const embeddingResult = await generateAndStoreEmbedding(saveResult.documentId, {
        document_type: fixture.documentType,
        raw_text: rawText,
        extraction,
      });
      if (!embeddingResult.success) {
        results.push({
          fileName: fixture.fileName,
          documentId: saveResult.documentId,
          alreadyExists: saveResult.alreadyExists,
          error: embeddingResult.error,
        });
        continue;
      }
    }

    results.push({
      fileName: fixture.fileName,
      documentId: saveResult.documentId,
      alreadyExists: saveResult.alreadyExists,
    });
  }

  console.log("\nSeed results:");
  for (const result of results) {
    if (result.error) {
      console.log(`- ${result.fileName}: ERROR ${result.error}`);
      continue;
    }
    const status = result.alreadyExists ? "exists" : "inserted";
    console.log(`- ${result.fileName}: ${status} (${result.documentId || "n/a"})`);
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
