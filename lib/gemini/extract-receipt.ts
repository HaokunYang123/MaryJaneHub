import { z } from "zod";
import { getGeminiModel, cleanJsonResponse } from "./client";

// Zod schemas
const ReceiptItemSchema = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  amount: z.number().nullable(),
});

const ReceiptResponseSchema = z.object({
  merchant_name: z.string().nullable(),
  date: z.string().nullable(),
  total: z.number().nullable(),
  payment_method: z.string().nullable(),
  items: z.array(ReceiptItemSchema).optional(),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  tip: z.number().nullable(),
});

// Export types
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;
export type ReceiptExtraction = z.infer<typeof ReceiptResponseSchema> & {
  confidence: number;
  raw_response: string;
};

const EXTRACTION_PROMPT = `You are a receipt data extraction assistant. Extract structured data from the following receipt text.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON, no markdown code blocks, no explanations
2. Use null for any fields you cannot find or are uncertain about
3. Parse dates into ISO format (YYYY-MM-DD)
4. Parse currency values into numbers (remove $, commas, currency symbols)
5. For items, extract as many as you can find

Return this exact JSON structure:
{
  "merchant_name": "store/restaurant name or null",
  "date": "YYYY-MM-DD or null",
  "total": number or null,
  "payment_method": "cash|credit|debit|other or null",
  "items": [
    {
      "description": "item description",
      "quantity": number or null,
      "unit_price": number or null,
      "amount": number or null
    }
  ],
  "subtotal": number or null,
  "tax": number or null,
  "tip": number or null
}

RECEIPT TEXT:
`;

function calculateConfidence(data: z.infer<typeof ReceiptResponseSchema>): number {
  const fields = [
    data.merchant_name,
    data.date,
    data.total,
    data.payment_method,
    data.subtotal,
    data.tax,
  ];

  const extractedFields = fields.filter((f) => f !== null && f !== undefined).length;
  const totalFields = fields.length;

  const hasItems = data.items && data.items.length > 0;
  const itemBonus = hasItems ? 0.1 : 0;

  const baseConfidence = extractedFields / totalFields;
  return Math.min(1, baseConfidence + itemBonus);
}

function parseResponse(rawResponse: string): z.infer<typeof ReceiptResponseSchema> {
  const cleaned = cleanJsonResponse(rawResponse);
  const parsed = JSON.parse(cleaned);
  return ReceiptResponseSchema.parse(parsed);
}

export async function extractReceipt(rawText: string): Promise<ReceiptExtraction> {
  const model = getGeminiModel();
  const prompt = EXTRACTION_PROMPT + rawText;
  const result = await model.generateContent(prompt);
  const response = result.response;
  const rawResponse = response.text();

  try {
    const parsed = parseResponse(rawResponse);

    return {
      merchant_name: parsed.merchant_name ?? null,
      date: parsed.date ?? null,
      total: parsed.total ?? null,
      payment_method: parsed.payment_method ?? null,
      items: parsed.items || [],
      subtotal: parsed.subtotal ?? null,
      tax: parsed.tax ?? null,
      tip: parsed.tip ?? null,
      confidence: calculateConfidence(parsed),
      raw_response: rawResponse,
    };
  } catch {
    return {
      merchant_name: null,
      date: null,
      total: null,
      payment_method: null,
      items: [],
      subtotal: null,
      tax: null,
      tip: null,
      confidence: 0,
      raw_response: rawResponse,
    };
  }
}
