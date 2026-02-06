import type {
  InvoiceExtraction,
  LineItem,
  GeminiInvoiceResponse,
} from "./types";
import { getGeminiModel, parseJsonResponse } from "./client";
import { generateStructuredJson, StructuredJsonError } from "./structured-json";
import { invoiceResponseSchema } from "./response-schemas";

const MAX_LINE_ITEMS = 30;

const EXTRACTION_PROMPT = `You are an invoice data extraction assistant. Extract structured data from the following invoice text.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON, no markdown code blocks, no explanations
2. Use null for any fields you cannot find or are uncertain about
3. Parse dates into ISO format (YYYY-MM-DD)
4. Parse currency values into numbers (remove $, commas, currency symbols)
5. For line items, return at most ${MAX_LINE_ITEMS} items in order; if more exist, include only the first ${MAX_LINE_ITEMS}
6. If line items are too long or unclear, return an empty array rather than partial or broken JSON
7. Do not include any additional keys

Return this exact JSON structure:
{
  "vendor": "company name or null",
  "invoice_number": "invoice number or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "line_items": [
    {
      "description": "item description",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number or null
    }
  ]
}

INVOICE TEXT:
`;

/**
 * Calculate confidence score based on how many fields were extracted
 */
function calculateConfidence(data: GeminiInvoiceResponse): number {
  const fields = [
    data.vendor,
    data.invoice_number,
    data.invoice_date,
    data.due_date,
    data.subtotal,
    data.tax,
    data.total,
  ];

  const extractedFields = fields.filter(
    (f) => f !== null && f !== undefined
  ).length;
  const totalFields = fields.length;

  // Also consider line items
  const hasLineItems = data.line_items && data.line_items.length > 0;
  const lineItemBonus = hasLineItems ? 0.1 : 0;

  const baseConfidence = extractedFields / totalFields;
  return Math.min(1, baseConfidence + lineItemBonus);
}

/**
 * Parse and validate the Gemini response into typed structure
 */
function parseResponse(rawResponse: string): GeminiInvoiceResponse {
  return parseJsonResponse<GeminiInvoiceResponse>(rawResponse);
}

/**
 * Normalize line items from raw response
 */
function normalizeLineItems(
  items: GeminiInvoiceResponse["line_items"]
): LineItem[] {
  if (!items || !Array.isArray(items)) {
    return [];
  }

  return items.slice(0, MAX_LINE_ITEMS).map((item) => ({
    description: item.description || "",
    quantity: item.quantity ?? null,
    unit_price: item.unit_price ?? null,
    amount: item.amount ?? null,
  }));
}

/**
 * Extract structured invoice data from raw OCR text using Gemini
 *
 * @param rawText - Raw text extracted from invoice via OCR
 * @returns Promise resolving to structured InvoiceExtraction
 */
export async function extractInvoiceWithGemini(
  rawText: string
): Promise<InvoiceExtraction> {
  const model = getGeminiModel();
  const prompt = EXTRACTION_PROMPT + rawText.slice(0, 12000);

  let rawResponse = "";
  try {
    const { parsed, rawResponse: modelRaw } = await generateStructuredJson({
      model,
      prompt,
      schema: invoiceResponseSchema,
      label: "invoice extraction",
      attempts: [
        { temperature: 0.1, maxOutputTokens: 1200 },
        {
          temperature: 0,
          maxOutputTokens: 1500,
          promptSuffix:
            "Return one JSON object only. No preface, no explanation, no markdown.",
        },
        {
          temperature: 0,
          maxOutputTokens: 900,
          promptSuffix:
            "Return one JSON object only. If line_items could exceed limits, set line_items to [].",
        },
      ],
      parser: parseResponse,
    });
    rawResponse = modelRaw;

    return {
      vendor: parsed.vendor ?? null,
      invoice_number: parsed.invoice_number ?? null,
      invoice_date: parsed.invoice_date ?? null,
      due_date: parsed.due_date ?? null,
      subtotal: parsed.subtotal ?? null,
      tax: parsed.tax ?? null,
      total: parsed.total ?? null,
      line_items: normalizeLineItems(parsed.line_items),
      confidence: calculateConfidence(parsed),
      raw_response: rawResponse,
    };
  } catch (error) {
    if (error instanceof StructuredJsonError && error.diagnostics?.rawResponse) {
      rawResponse = error.diagnostics.rawResponse;
    }
    if (error instanceof StructuredJsonError && error.diagnostics?.finishReason) {
      console.warn(
        `  Invoice extraction finish reason: ${error.diagnostics.finishReason}` +
          (error.diagnostics.finishMessage ? ` (${error.diagnostics.finishMessage})` : "")
      );
    }

    // Return a failed extraction with the raw response for debugging
    return {
      vendor: null,
      invoice_number: null,
      invoice_date: null,
      due_date: null,
      subtotal: null,
      tax: null,
      total: null,
      line_items: [],
      confidence: 0,
      raw_response: rawResponse,
    };
  }

  return {
    vendor: null,
    invoice_number: null,
    invoice_date: null,
    due_date: null,
    subtotal: null,
    tax: null,
    total: null,
    line_items: [],
    confidence: 0,
    raw_response: rawResponse,
  };
}
