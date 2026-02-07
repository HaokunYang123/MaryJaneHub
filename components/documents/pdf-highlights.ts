import type { DocumentBBox, SourceContext } from "@/components/layout/ai-rail-types";

export type PdfHighlight = {
  page: number; // 1-indexed
  bbox: DocumentBBox; // normalized 0-1
  label: string;
  type: "match" | "field";
};

const KEY_FIELDS: Record<string, string> = {
  vendor: "Vendor",
  merchant_name: "Merchant",
  date: "Date",
  invoice_date: "Invoice Date",
  total: "Total",
  amount: "Amount",
  invoice_number: "Invoice #",
  bill_to: "Bill To",
  account_number: "Account #",
};

type FieldEvidence = {
  evidence?: {
    page?: number;
    coords?: DocumentBBox;
  };
};

export function extractHighlights(
  extraction: Record<string, unknown> | null | undefined,
  context: SourceContext | null
): PdfHighlight[] {
  const highlights: PdfHighlight[] = [];

  // 1. Search match highlight from activeContext
  if (context?.coords && context.page) {
    highlights.push({
      page: context.page,
      bbox: context.coords,
      label: "Search match",
      type: "match",
    });
  }

  // 2. Field evidence highlights from extraction data
  if (extraction) {
    const data = (extraction.data && typeof extraction.data === "object"
      ? extraction.data
      : extraction) as Record<string, unknown>;

    const fieldEvidence = data.field_evidence as Record<string, FieldEvidence> | undefined;
    if (fieldEvidence && typeof fieldEvidence === "object") {
      for (const [field, label] of Object.entries(KEY_FIELDS)) {
        const entry = fieldEvidence[field];
        if (!entry?.evidence?.coords || !entry.evidence.page) continue;
        highlights.push({
          page: entry.evidence.page,
          bbox: entry.evidence.coords,
          label,
          type: "field",
        });
      }
    }
  }

  return highlights;
}
