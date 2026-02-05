import { z } from "zod";
import type { FieldEvidenceMap } from "./field-evidence";
import { getGeminiModel, cleanJsonResponse } from "./client";
import { buildJsonRequest, generateContentWithTimeout } from "./call";
import { contractResponseSchema } from "./response-schemas";

// Zod schemas
const PartySchema = z.object({
  name: z.string(),
  role: z.string().nullable(),
  address: z.string().nullable(),
});

const KeyTermSchema = z.object({
  term: z.string(),
  description: z.string(),
});

const ContractResponseSchema = z.object({
  contract_type: z.string().nullable(),
  parties: z.array(PartySchema).optional(),
  effective_date: z.string().nullable(),
  expiration_date: z.string().nullable(),
  value: z.number().nullable(),
  key_terms: z.array(KeyTermSchema).optional(),
  governing_law: z.string().nullable(),
  termination_clause: z.string().nullable(),
});

// Export types
export type Party = z.infer<typeof PartySchema>;
export type KeyTerm = z.infer<typeof KeyTermSchema>;
export type ContractExtraction = z.infer<typeof ContractResponseSchema> & {
  confidence: number;
  raw_response: string;
  field_evidence?: FieldEvidenceMap;
};

const EXTRACTION_PROMPT = `You are a contract data extraction assistant. Extract structured data from the following contract text.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON, no markdown code blocks, no explanations
2. Use null for any fields you cannot find or are uncertain about
3. Parse dates into ISO format (YYYY-MM-DD)
4. Parse currency values into numbers (remove $, commas, currency symbols)
5. For contract_type, identify: service_agreement, lease, employment, nda, purchase_agreement, partnership, or other
6. Extract all parties involved in the contract
7. Extract key terms and their descriptions

Return this exact JSON structure:
{
  "contract_type": "type of contract or null",
  "parties": [
    {
      "name": "party name",
      "role": "provider|client|landlord|tenant|employer|employee|other or null",
      "address": "address or null"
    }
  ],
  "effective_date": "YYYY-MM-DD or null",
  "expiration_date": "YYYY-MM-DD or null",
  "value": number or null,
  "key_terms": [
    {
      "term": "term name",
      "description": "brief description of the term"
    }
  ],
  "governing_law": "jurisdiction or null",
  "termination_clause": "brief summary of termination conditions or null"
}

CONTRACT TEXT:
`;

function calculateConfidence(data: z.infer<typeof ContractResponseSchema>): number {
  const fields = [
    data.contract_type,
    data.effective_date,
    data.expiration_date,
    data.value,
    data.governing_law,
    data.termination_clause,
  ];

  const extractedFields = fields.filter((f) => f !== null && f !== undefined).length;
  const totalFields = fields.length;

  const hasParties = data.parties && data.parties.length > 0;
  const hasKeyTerms = data.key_terms && data.key_terms.length > 0;
  const bonus = (hasParties ? 0.1 : 0) + (hasKeyTerms ? 0.1 : 0);

  const baseConfidence = extractedFields / totalFields;
  return Math.min(1, baseConfidence + bonus);
}

function parseResponse(rawResponse: string): z.infer<typeof ContractResponseSchema> {
  const cleaned = cleanJsonResponse(rawResponse);
  const parsed = JSON.parse(cleaned);
  return ContractResponseSchema.parse(parsed);
}

export async function extractContract(rawText: string): Promise<ContractExtraction> {
  const model = getGeminiModel();
  const prompt = EXTRACTION_PROMPT + rawText;
  let rawResponse = "";

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const temperature = attempt === 0 ? 0.2 : 0;
      const request = buildJsonRequest(prompt, contractResponseSchema, {
        temperature,
        maxOutputTokens: 1400,
      });
      const result = await generateContentWithTimeout(model, request);
      const response = result.response;
      rawResponse = response.text();
      try {
        const parsed = parseResponse(rawResponse);

        return {
          contract_type: parsed.contract_type ?? null,
          parties: parsed.parties || [],
          effective_date: parsed.effective_date ?? null,
          expiration_date: parsed.expiration_date ?? null,
          value: parsed.value ?? null,
          key_terms: parsed.key_terms || [],
          governing_law: parsed.governing_law ?? null,
          termination_clause: parsed.termination_clause ?? null,
          confidence: calculateConfidence(parsed),
          raw_response: rawResponse,
        };
      } catch (parseError) {
        if (attempt === 1) {
          throw parseError;
        }
      }
    }
  } catch {
    return {
      contract_type: null,
      parties: [],
      effective_date: null,
      expiration_date: null,
      value: null,
      key_terms: [],
      governing_law: null,
      termination_clause: null,
      confidence: 0,
      raw_response: rawResponse,
    };
  }

  return {
    contract_type: null,
    parties: [],
    effective_date: null,
    expiration_date: null,
    value: null,
    key_terms: [],
    governing_law: null,
    termination_clause: null,
    confidence: 0,
    raw_response: rawResponse,
  };
}
