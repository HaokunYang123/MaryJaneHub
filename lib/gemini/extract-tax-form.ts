import { z } from "zod";
import type { FieldEvidenceMap } from "./field-evidence";
import { getGeminiModel, cleanJsonResponse } from "./client";
import { generateContentWithTimeout } from "./call";

// Zod schemas
const TaxFormResponseSchema = z.object({
  form_type: z.string().nullable(),
  tax_year: z.number().nullable(),
  entity_name: z.string().nullable(),
  entity_type: z.string().nullable(),
  ein_last4: z.string().nullable(),
  ssn_last4: z.string().nullable(),
  address: z.string().nullable(),
  total_income: z.number().nullable(),
  total_tax: z.number().nullable(),
  tax_withheld: z.number().nullable(),
  refund_or_owed: z.number().nullable(),
});

// Export types
export type TaxFormExtraction = z.infer<typeof TaxFormResponseSchema> & {
  confidence: number;
  raw_response: string;
  field_evidence?: FieldEvidenceMap;
};

const EXTRACTION_PROMPT = `You are a tax form data extraction assistant. Extract structured data from the following tax document text.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON, no markdown code blocks, no explanations
2. Use null for any fields you cannot find or are uncertain about
3. Parse currency values into numbers (remove $, commas, currency symbols)
4. For ein_last4 or ssn_last4, only include the last 4 digits
5. Common form types: W-2, W-9, 1099-MISC, 1099-NEC, 1099-INT, 1099-DIV, 1040, 1065, 1120

Return this exact JSON structure:
{
  "form_type": "W-2|W-9|1099-MISC|1099-NEC|1040|etc or null",
  "tax_year": number or null,
  "entity_name": "person or company name or null",
  "entity_type": "individual|business|corporation|partnership or null",
  "ein_last4": "last 4 digits of EIN or null",
  "ssn_last4": "last 4 digits of SSN or null",
  "address": "address or null",
  "total_income": number or null,
  "total_tax": number or null,
  "tax_withheld": number or null,
  "refund_or_owed": number or null
}

TAX FORM TEXT:
`;

function calculateConfidence(data: z.infer<typeof TaxFormResponseSchema>): number {
  const fields = [
    data.form_type,
    data.tax_year,
    data.entity_name,
    data.ein_last4 || data.ssn_last4,
    data.total_income,
    data.total_tax,
  ];

  const extractedFields = fields.filter((f) => f !== null && f !== undefined).length;
  const totalFields = fields.length;

  const baseConfidence = extractedFields / totalFields;
  return Math.min(1, baseConfidence);
}

function parseResponse(rawResponse: string): z.infer<typeof TaxFormResponseSchema> {
  const cleaned = cleanJsonResponse(rawResponse);
  const parsed = JSON.parse(cleaned);
  return TaxFormResponseSchema.parse(parsed);
}

export async function extractTaxForm(rawText: string): Promise<TaxFormExtraction> {
  const model = getGeminiModel();
  const prompt = EXTRACTION_PROMPT + rawText;
  const result = await generateContentWithTimeout(model, prompt);
  const response = result.response;
  const rawResponse = response.text();

  try {
    const parsed = parseResponse(rawResponse);

    return {
      form_type: parsed.form_type ?? null,
      tax_year: parsed.tax_year ?? null,
      entity_name: parsed.entity_name ?? null,
      entity_type: parsed.entity_type ?? null,
      ein_last4: parsed.ein_last4 ?? null,
      ssn_last4: parsed.ssn_last4 ?? null,
      address: parsed.address ?? null,
      total_income: parsed.total_income ?? null,
      total_tax: parsed.total_tax ?? null,
      tax_withheld: parsed.tax_withheld ?? null,
      refund_or_owed: parsed.refund_or_owed ?? null,
      confidence: calculateConfidence(parsed),
      raw_response: rawResponse,
    };
  } catch {
    return {
      form_type: null,
      tax_year: null,
      entity_name: null,
      entity_type: null,
      ein_last4: null,
      ssn_last4: null,
      address: null,
      total_income: null,
      total_tax: null,
      tax_withheld: null,
      refund_or_owed: null,
      confidence: 0,
      raw_response: rawResponse,
    };
  }
}
