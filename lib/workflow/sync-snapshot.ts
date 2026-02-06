import type { FieldEvidenceMap } from "../gemini/field-evidence";
import type { InvoiceExtraction, LineItem } from "../gemini/types";

export interface SyncSnapshot {
  version: 1;
  captured_at: string;
  source_status: string;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: LineItem[];
  confidence: number;
  field_evidence?: FieldEvidenceMap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];

  const items: LineItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    items.push({
      description: typeof raw.description === "string" ? raw.description : "",
      quantity: typeof raw.quantity === "number" && Number.isFinite(raw.quantity) ? raw.quantity : null,
      unit_price: typeof raw.unit_price === "number" && Number.isFinite(raw.unit_price) ? raw.unit_price : null,
      amount: typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : null,
    });
  }

  return items;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cloneFieldEvidence(value: unknown): FieldEvidenceMap | undefined {
  if (!isRecord(value)) return undefined;
  return JSON.parse(JSON.stringify(value)) as FieldEvidenceMap;
}

export function buildSyncSnapshotFromInvoice(
  invoice: InvoiceExtraction,
  sourceStatus: string
): SyncSnapshot {
  return {
    version: 1,
    captured_at: new Date().toISOString(),
    source_status: sourceStatus,
    vendor: invoice.vendor || null,
    invoice_number: invoice.invoice_number || null,
    invoice_date: invoice.invoice_date || null,
    due_date: invoice.due_date || null,
    subtotal: asNullableNumber(invoice.subtotal),
    tax: asNullableNumber(invoice.tax),
    total: asNullableNumber(invoice.total),
    line_items: cloneLineItems(invoice.line_items),
    confidence: asConfidence(invoice.confidence),
    field_evidence: cloneFieldEvidence(invoice.field_evidence),
  };
}

export function readSyncSnapshotFromOverrides(
  humanOverrides: Record<string, unknown> | null | undefined
): SyncSnapshot | null {
  if (!isRecord(humanOverrides)) return null;
  const raw = humanOverrides.sync_snapshot;
  if (!isRecord(raw)) return null;

  const snapshot: SyncSnapshot = {
    version: 1,
    captured_at:
      typeof raw.captured_at === "string" ? raw.captured_at : new Date().toISOString(),
    source_status:
      typeof raw.source_status === "string" ? raw.source_status : "unknown",
    vendor: asNullableString(raw.vendor),
    invoice_number: asNullableString(raw.invoice_number),
    invoice_date: asNullableString(raw.invoice_date),
    due_date: asNullableString(raw.due_date),
    subtotal: asNullableNumber(raw.subtotal),
    tax: asNullableNumber(raw.tax),
    total: asNullableNumber(raw.total),
    line_items: cloneLineItems(raw.line_items),
    confidence: asConfidence(raw.confidence),
    field_evidence: cloneFieldEvidence(raw.field_evidence),
  };

  return snapshot;
}

export function withSyncSnapshotInOverrides(
  existingOverrides: Record<string, unknown> | null | undefined,
  snapshot: SyncSnapshot
): Record<string, unknown> {
  const base = isRecord(existingOverrides) ? existingOverrides : {};
  return {
    ...base,
    sync_snapshot: snapshot,
  };
}

export function applySyncSnapshotToInvoice(
  current: InvoiceExtraction,
  snapshot: SyncSnapshot
): InvoiceExtraction {
  return {
    ...current,
    vendor: snapshot.vendor,
    invoice_number: snapshot.invoice_number,
    invoice_date: snapshot.invoice_date,
    due_date: snapshot.due_date,
    subtotal: snapshot.subtotal,
    tax: snapshot.tax,
    total: snapshot.total,
    line_items: cloneLineItems(snapshot.line_items),
    confidence: snapshot.confidence,
    field_evidence: cloneFieldEvidence(snapshot.field_evidence),
  };
}
