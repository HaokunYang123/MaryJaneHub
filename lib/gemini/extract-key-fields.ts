import type { DocumentType } from "./document-types";
import { getGeminiModel, parseJsonResponse } from "./client";
import { generateStructuredJson, StructuredJsonError } from "./structured-json";
import {
  type ResponseSchema,
  bankStatementKeyFieldsResponseSchema,
  contractKeyFieldsResponseSchema,
  correspondenceKeyFieldsResponseSchema,
  invoiceKeyFieldsResponseSchema,
  receiptKeyFieldsResponseSchema,
  taxFormKeyFieldsResponseSchema,
} from "./response-schemas";

type KeyFieldResult = {
  data: Record<string, unknown>;
  confidence: number;
  rawResponse: string;
};

const PROMPTS: Record<DocumentType | "other", string> = {
  invoice: `You are extracting key invoice fields for recovery. Return ONLY valid JSON.
Do not include any additional keys, line items, or commentary.
Keys:
{
  "vendor": string or null,
  "invoice_number": string or null,
  "invoice_date": "YYYY-MM-DD" or null,
  "due_date": "YYYY-MM-DD" or null,
  "total": number or null
}
INVOICE TEXT:\n`,
  receipt: `You are extracting key receipt fields for recovery. Return ONLY valid JSON.
Do not include any additional keys or commentary.
Keys:
{
  "merchant_name": string or null,
  "date": "YYYY-MM-DD" or null,
  "total": number or null
}
RECEIPT TEXT:\n`,
  bank_statement: `You are extracting key bank statement fields for recovery. Return ONLY valid JSON.
Do not include any additional keys or commentary.
Keys:
{
  "bank_name": string or null,
  "account_number_last4": string or null,
  "statement_period_start": "YYYY-MM-DD" or null,
  "statement_period_end": "YYYY-MM-DD" or null,
  "opening_balance": number or null,
  "closing_balance": number or null
}
STATEMENT TEXT:\n`,
  contract: `You are extracting key contract fields for recovery. Return ONLY valid JSON.
Do not include any additional keys or commentary.
Keys:
{
  "contract_type": string or null,
  "parties": [{"name": string, "role": string or null, "address": string or null}] or [],
  "effective_date": "YYYY-MM-DD" or null,
  "expiration_date": "YYYY-MM-DD" or null
}
CONTRACT TEXT:\n`,
  tax_form: `You are extracting key tax form fields for recovery. Return ONLY valid JSON.
Do not include any additional keys or commentary.
Keys:
{
  "form_type": string or null,
  "tax_year": number or null,
  "entity_name": string or null,
  "ein_last4": string or null,
  "ssn_last4": string or null
}
TAX FORM TEXT:\n`,
  correspondence: `You are extracting key correspondence fields for recovery. Return ONLY valid JSON.
Do not include any additional keys or commentary.
Keys:
{
  "sender": string or null,
  "sender_organization": string or null,
  "date": "YYYY-MM-DD" or null,
  "subject": string or null,
  "summary": string or null
}
CORRESPONDENCE TEXT:\n`,
  other: `You are extracting key document fields for recovery. Return ONLY valid JSON.
Do not include any additional keys, line items, or commentary.
Keys:
{
  "vendor": string or null,
  "invoice_number": string or null,
  "invoice_date": "YYYY-MM-DD" or null,
  "due_date": "YYYY-MM-DD" or null,
  "total": number or null
}
DOCUMENT TEXT:\n`,
};

function isPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function computeConfidence(data: Record<string, unknown>, keys: string[]): number {
  if (keys.length === 0) return 0;
  const present = keys.filter((key) => isPresent(data[key])).length;
  return Math.min(1, present / keys.length);
}

async function runKeyFieldPrompt(
  prompt: string,
  schema: ResponseSchema,
  rawText: string,
  keys: string[]
): Promise<KeyFieldResult> {
  const model = getGeminiModel();
  try {
    const { parsed, rawResponse } = await generateStructuredJson<Record<string, unknown>>({
      model,
      prompt: prompt + rawText.slice(0, 6000),
      schema,
      label: "key-field fallback",
      attempts: [
        { temperature: 0, maxOutputTokens: 600 },
        {
          temperature: 0,
          maxOutputTokens: 900,
          promptSuffix:
            "Return one JSON object only. No preface, no explanation, no markdown.",
        },
      ],
      parser: (raw) => parseJsonResponse<Record<string, unknown>>(raw),
    });

    const confidence = computeConfidence(parsed, keys);
    return { data: parsed, confidence, rawResponse };
  } catch (error) {
    if (error instanceof StructuredJsonError && error.diagnostics?.finishReason) {
      console.warn(
        `  Key-field fallback finish reason: ${error.diagnostics.finishReason}` +
          (error.diagnostics.finishMessage ? ` (${error.diagnostics.finishMessage})` : "")
      );
    }
    throw error;
  }
}

export async function extractKeyFields(
  documentType: DocumentType,
  rawText: string
): Promise<KeyFieldResult> {
  const type = documentType === "other" ? "other" : documentType;

  switch (type) {
    case "invoice":
      return runKeyFieldPrompt(
        PROMPTS.invoice,
        invoiceKeyFieldsResponseSchema,
        rawText,
        ["vendor", "invoice_number", "invoice_date", "due_date", "total"]
      );
    case "receipt":
      return runKeyFieldPrompt(
        PROMPTS.receipt,
        receiptKeyFieldsResponseSchema,
        rawText,
        ["merchant_name", "date", "total"]
      );
    case "bank_statement":
      return runKeyFieldPrompt(
        PROMPTS.bank_statement,
        bankStatementKeyFieldsResponseSchema,
        rawText,
        [
          "bank_name",
          "account_number_last4",
          "statement_period_start",
          "statement_period_end",
          "opening_balance",
          "closing_balance",
        ]
      );
    case "contract":
      return runKeyFieldPrompt(
        PROMPTS.contract,
        contractKeyFieldsResponseSchema,
        rawText,
        ["contract_type", "parties", "effective_date", "expiration_date"]
      );
    case "tax_form":
      return runKeyFieldPrompt(
        PROMPTS.tax_form,
        taxFormKeyFieldsResponseSchema,
        rawText,
        ["form_type", "tax_year", "entity_name", "ein_last4", "ssn_last4"]
      );
    case "correspondence":
      return runKeyFieldPrompt(
        PROMPTS.correspondence,
        correspondenceKeyFieldsResponseSchema,
        rawText,
        ["sender", "sender_organization", "date", "subject", "summary"]
      );
    case "other":
    default:
      return runKeyFieldPrompt(
        PROMPTS.other,
        invoiceKeyFieldsResponseSchema,
        rawText,
        ["vendor", "invoice_number", "invoice_date", "due_date", "total"]
      );
  }
}
