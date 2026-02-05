import assert from "node:assert/strict";
import { ensureFieldEvidence } from "../lib/workflow/field-evidence";
import type { DocumentExtraction } from "../lib/gemini/extract-document";
import type { FieldEvidenceMap } from "../lib/gemini/field-evidence";

const rawText = [
  "INVOICE",
  "Vendor: Acme Corp",
  "Invoice Number: AC-1001",
  "Invoice Date: 2024-01-15",
  "Total: $250.00",
].join("\n");

const extraction: DocumentExtraction = {
  type: "invoice",
  data: {
    vendor: "Acme Corp",
    invoice_number: "AC-1001",
    invoice_date: "2024-01-15",
    due_date: null,
    subtotal: null,
    tax: null,
    total: 250,
    line_items: [],
    confidence: 0.92,
    raw_response: "seeded",
  },
};

const existingEvidence: FieldEvidenceMap = {
  vendor: {
    value: "Acme Corp",
    confidence: 0.92,
    evidence: {
      page: 1,
      quote: null,
      coords: null,
    },
  },
};

const first = ensureFieldEvidence(extraction, rawText, existingEvidence);
const second = ensureFieldEvidence(extraction, rawText, first);

assert.deepEqual(
  first,
  second,
  "ensureFieldEvidence should be idempotent when re-run"
);

assert.ok(first.total, "total field evidence should exist");
assert.equal(first.total.value, 250, "total value should be preserved");

console.log("field evidence backfill idempotency: OK");
