import type { FieldEvidenceMap } from "./field-evidence";

/**
 * Represents a single line item on an invoice
 */
export interface LineItem {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

/**
 * Structured extraction result from Gemini
 */
export interface InvoiceExtraction {
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // ISO format YYYY-MM-DD
  due_date: string | null; // ISO format YYYY-MM-DD
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: LineItem[];
  confidence: number; // 0-1, based on how many fields were extracted
  raw_response: string; // for debugging
  field_evidence?: FieldEvidenceMap;
}

/**
 * Raw JSON structure expected from Gemini response
 */
export interface GeminiInvoiceResponse {
  vendor?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  due_date?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  line_items?: Array<{
    description?: string;
    quantity?: number | null;
    unit_price?: number | null;
    amount?: number | null;
  }>;
}
