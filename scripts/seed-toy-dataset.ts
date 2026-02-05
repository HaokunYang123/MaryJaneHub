#!/usr/bin/env node
/**
 * Seed a local toy dataset (fixture-based).
 *
 * Creates deterministic PDFs and a JSON bundle without external credentials.
 */

import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { DocumentExtraction } from "../lib/gemini/extract-document";
import { ensureFieldEvidence } from "../lib/workflow/field-evidence";

const FIXTURE_DIR = "test-files/toy-fixtures";
const DATASET_PATH = path.join(FIXTURE_DIR, "toy-dataset.json");

type FixtureBase = {
  fileName: string;
  documentType: "invoice" | "receipt";
  vendor: string;
  date: string;
  total: number;
};

type InvoiceFixture = FixtureBase & {
  documentType: "invoice";
  invoiceNumber: string;
  dueDate: string;
  subtotal: number;
  tax: number;
};

type ReceiptFixture = FixtureBase & {
  documentType: "receipt";
  paymentMethod: string;
  subtotal: number;
  tax: number;
  tip: number;
};

type Fixture = InvoiceFixture | ReceiptFixture;

const FIXTURES: Fixture[] = [
  {
    fileName: "2024-01-15-acme-invoice.pdf",
    documentType: "invoice",
    vendor: "Acme Corp",
    invoiceNumber: "AC-1001",
    date: "2024-01-15",
    dueDate: "2024-02-14",
    subtotal: 230,
    tax: 20,
    total: 250,
  },
  {
    fileName: "2024-02-03-acme-receipt.pdf",
    documentType: "receipt",
    vendor: "Acme Corp",
    date: "2024-02-03",
    paymentMethod: "credit",
    subtotal: 50,
    tax: 4,
    tip: 0,
    total: 54,
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

function buildExtraction(fixture: Fixture, rawText: string): DocumentExtraction {
  if (fixture.documentType === "invoice") {
    const extraction: DocumentExtraction = {
      type: "invoice",
      data: {
        vendor: fixture.vendor,
        invoice_number: fixture.invoiceNumber,
        invoice_date: fixture.date,
        due_date: fixture.dueDate,
        subtotal: fixture.subtotal,
        tax: fixture.tax,
        total: fixture.total,
        line_items: [],
        confidence: 1,
        raw_response: "toy-seed",
      },
    };
    extraction.data.field_evidence = ensureFieldEvidence(extraction, rawText, undefined);
    return extraction;
  }

  const extraction: DocumentExtraction = {
    type: "receipt",
    data: {
      merchant_name: fixture.vendor,
      date: fixture.date,
      total: fixture.total,
      payment_method: fixture.paymentMethod,
      items: [],
      subtotal: fixture.subtotal,
      tax: fixture.tax,
      tip: fixture.tip,
      confidence: 1,
      raw_response: "toy-seed",
    },
  };
  extraction.data.field_evidence = ensureFieldEvidence(extraction, rawText, undefined);
  return extraction;
}

async function main(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });

  const documents: Array<{
    file_name: string;
    document_type: string;
    raw_text: string;
    extraction: DocumentExtraction;
  }> = [];

  for (const fixture of FIXTURES) {
    const filePath = path.join(FIXTURE_DIR, fixture.fileName);
    const lines =
      fixture.documentType === "invoice"
        ? buildInvoiceRawText(fixture)
        : buildReceiptRawText(fixture);

    if (!existsSync(filePath)) {
      const pdfBuffer = buildPdfBuffer(lines);
      await writeFile(filePath, pdfBuffer);
    }

    const rawText = lines.join("\n");
    const extraction = buildExtraction(fixture, rawText);

    documents.push({
      file_name: fixture.fileName,
      document_type: fixture.documentType,
      raw_text: rawText,
      extraction,
    });
  }

  const payload = {
    generated_at: new Date().toISOString(),
    documents,
  };

  await writeFile(DATASET_PATH, JSON.stringify(payload, null, 2));

  console.log(`Toy dataset written to ${DATASET_PATH}`);
  console.log(`Fixtures directory: ${FIXTURE_DIR}`);
}

main().catch((error) => {
  console.error("Toy dataset seed failed:", error);
  process.exit(1);
});
