import type {
  InvoiceExtraction,
  LineItem,
  GeminiInvoiceResponse,
} from "./types";
import { getGeminiModel, cleanJsonResponse } from "./client";
import { generateContentWithTimeout } from "./call";

const EXTRACTION_PROMPT = `You are an invoice data extraction assistant. Extract structured data from the following invoice text.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON, no markdown code blocks, no explanations
2. Use null for any fields you cannot find or are uncertain about
3. Parse dates into ISO format (YYYY-MM-DD)
4. Parse currency values into numbers (remove $, commas, currency symbols)
5. For line items, extract as many as you can find

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
  const cleaned = cleanJsonResponse(rawResponse);
  return JSON.parse(cleaned) as GeminiInvoiceResponse;
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

  return items.map((item) => ({
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
  const prompt = EXTRACTION_PROMPT + rawText;

  const result = await generateContentWithTimeout(model, prompt);
  const response = result.response;
  const rawResponse = response.text();

  try {
    const parsed = parseResponse(rawResponse);

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
  } catch (parseError) {
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
}
