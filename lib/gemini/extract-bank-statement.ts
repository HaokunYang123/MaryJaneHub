import { z } from "zod";
import type { FieldEvidenceMap } from "./field-evidence";
import { getGeminiModel, parseJsonResponse } from "./client";
import { generateStructuredJson, StructuredJsonError } from "./structured-json";
import {
  bankStatementKeyFieldsResponseSchema,
  bankStatementResponseSchema,
} from "./response-schemas";

// Zod schemas
const TransactionSchema = z.object({
  date: z.string().nullable(),
  description: z.string(),
  amount: z.number().nullable(),
  type: z.enum(["deposit", "withdrawal", "transfer", "fee", "other"]).nullable(),
  balance: z.number().nullable(),
});

const BankStatementResponseSchema = z.object({
  bank_name: z.string().nullable(),
  account_number_last4: z.string().nullable(),
  statement_period_start: z.string().nullable(),
  statement_period_end: z.string().nullable(),
  opening_balance: z.number().nullable(),
  closing_balance: z.number().nullable(),
  total_deposits: z.number().nullable(),
  total_withdrawals: z.number().nullable(),
  transactions: z.array(TransactionSchema).optional(),
});

// Export types
export type Transaction = z.infer<typeof TransactionSchema>;
export type BankStatementExtraction = z.infer<typeof BankStatementResponseSchema> & {
  confidence: number;
  raw_response: string;
  field_evidence?: FieldEvidenceMap;
};

const EXTRACTION_PROMPT = `You are a bank statement data extraction assistant. Extract structured data from the following bank statement text.

IMPORTANT INSTRUCTIONS:
1. Return ONLY valid JSON, no markdown code blocks, no explanations
2. Use null for any fields you cannot find or are uncertain about
3. Parse dates into ISO format (YYYY-MM-DD)
4. Parse currency values into numbers (remove $, commas, currency symbols)
5. For account_number_last4, only include the last 4 digits
6. Do NOT output a full transaction ledger; return transactions as [] when there are more than 15 rows

Return this exact JSON structure:
{
  "bank_name": "bank name or null",
  "account_number_last4": "last 4 digits or null",
  "statement_period_start": "YYYY-MM-DD or null",
  "statement_period_end": "YYYY-MM-DD or null",
  "opening_balance": number or null,
  "closing_balance": number or null,
  "total_deposits": number or null,
  "total_withdrawals": number or null,
  "transactions": [
    {
      "date": "YYYY-MM-DD or null",
      "description": "transaction description",
      "amount": number or null,
      "type": "deposit|withdrawal|transfer|fee|other or null",
      "balance": number or null
    }
  ]
}

BANK STATEMENT TEXT:
`;

function calculateConfidence(data: z.infer<typeof BankStatementResponseSchema>): number {
  const fields = [
    data.bank_name,
    data.account_number_last4,
    data.statement_period_start,
    data.statement_period_end,
    data.opening_balance,
    data.closing_balance,
    data.total_deposits,
    data.total_withdrawals,
  ];

  const extractedFields = fields.filter((f) => f !== null && f !== undefined).length;
  const totalFields = fields.length;

  const hasTransactions = data.transactions && data.transactions.length > 0;
  const transactionBonus = hasTransactions ? 0.1 : 0;

  const baseConfidence = extractedFields / totalFields;
  return Math.min(1, baseConfidence + transactionBonus);
}

function parseResponse(rawResponse: string): z.infer<typeof BankStatementResponseSchema> {
  const parsed = parseJsonResponse<Record<string, unknown>>(rawResponse);
  return BankStatementResponseSchema.parse(parsed);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function normalizeFromKeyFields(data: Record<string, unknown>): z.infer<typeof BankStatementResponseSchema> {
  return {
    bank_name: toNullableString(data.bank_name),
    account_number_last4: toNullableString(data.account_number_last4),
    statement_period_start: toNullableString(data.statement_period_start),
    statement_period_end: toNullableString(data.statement_period_end),
    opening_balance: toNullableNumber(data.opening_balance),
    closing_balance: toNullableNumber(data.closing_balance),
    total_deposits: null,
    total_withdrawals: null,
    transactions: [],
  };
}

export async function extractBankStatement(rawText: string): Promise<BankStatementExtraction> {
  const model = getGeminiModel();
  const prompt = EXTRACTION_PROMPT + rawText.slice(0, 12000);
  let rawResponse = "";

  try {
    const { parsed, rawResponse: modelRaw } = await generateStructuredJson({
      model,
      prompt,
      schema: bankStatementResponseSchema,
      label: "bank statement extraction",
      attempts: [
        { temperature: 0.1, maxOutputTokens: 1200 },
        {
          temperature: 0,
          maxOutputTokens: 1800,
          promptSuffix:
            "Return one JSON object only. No preface, no explanation, no markdown. " +
            "If transactions are many, return transactions as [] and keep top-level balances/period fields complete.",
        },
      ],
      parser: parseResponse,
    });
    rawResponse = modelRaw;

    return {
      bank_name: parsed.bank_name ?? null,
      account_number_last4: parsed.account_number_last4 ?? null,
      statement_period_start: parsed.statement_period_start ?? null,
      statement_period_end: parsed.statement_period_end ?? null,
      opening_balance: parsed.opening_balance ?? null,
      closing_balance: parsed.closing_balance ?? null,
      total_deposits: parsed.total_deposits ?? null,
      total_withdrawals: parsed.total_withdrawals ?? null,
      transactions: parsed.transactions || [],
      confidence: calculateConfidence(parsed),
      raw_response: rawResponse,
    };
  } catch (error) {
    if (error instanceof StructuredJsonError && error.diagnostics?.rawResponse) {
      rawResponse = error.diagnostics.rawResponse;
    }
    if (error instanceof StructuredJsonError && error.diagnostics?.finishReason) {
      console.warn(
        `  Bank statement extraction finish reason: ${error.diagnostics.finishReason}` +
          (error.diagnostics.finishMessage ? ` (${error.diagnostics.finishMessage})` : "")
      );
    }

    try {
      const { parsed: fallbackParsed, rawResponse: fallbackRaw } =
        await generateStructuredJson<Record<string, unknown>>({
          model,
          prompt:
            "Extract only top-level bank statement fields. Do not return transaction rows. " +
            "Return JSON with keys bank_name, account_number_last4, statement_period_start, " +
            "statement_period_end, opening_balance, closing_balance.\n\nBANK STATEMENT TEXT:\n" +
            rawText.slice(0, 9000),
          schema: bankStatementKeyFieldsResponseSchema,
          label: "bank statement key-field fallback",
          attempts: [
            { temperature: 0, maxOutputTokens: 700 },
            {
              temperature: 0,
              maxOutputTokens: 1000,
              promptSuffix:
                "Return one JSON object only. No markdown, no explanations, and no transaction list.",
            },
          ],
          parser: (raw) => parseJsonResponse<Record<string, unknown>>(raw),
        });

      rawResponse = fallbackRaw;
      const normalized = normalizeFromKeyFields(fallbackParsed);
      return {
        ...normalized,
        confidence: calculateConfidence(normalized),
        raw_response: rawResponse,
      };
    } catch (fallbackError) {
      if (fallbackError instanceof StructuredJsonError && fallbackError.diagnostics?.rawResponse) {
        rawResponse = fallbackError.diagnostics.rawResponse;
      }
      return {
        bank_name: null,
        account_number_last4: null,
        statement_period_start: null,
        statement_period_end: null,
        opening_balance: null,
        closing_balance: null,
        total_deposits: null,
        total_withdrawals: null,
        transactions: [],
        confidence: 0,
        raw_response: rawResponse,
      };
    }
  }
}
