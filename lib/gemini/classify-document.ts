import type { ClassificationResult, DocumentType } from "./document-types";
import { isValidDocumentType } from "./document-types";
import { getGeminiModel, parseJsonResponse } from "./client";
import { generateStructuredJson, StructuredJsonError } from "./structured-json";
import { classificationResponseSchema } from "./response-schemas";

const CLASSIFICATION_PROMPT = `Classify the document into exactly one type:
receipt, invoice, bank_statement, contract, tax_form, correspondence, other.

Rules:
- Receipt: proof of completed payment (POS style, paid/thank-you language, tip/change/payment method).
- Invoice: request for payment (invoice number, amount due, due date, payment terms, remit to).
- Bank statement: account statement period, account number, balances, transaction ledger.
- Contract: legal agreement terms between parties with obligations, signatures, effective/termination language.
- Tax form: official tax form identifiers (W-2, W-9, 1099, 1040, EIN/SSN tax fields).
- Correspondence: letter/email/memo/notice that does not match the above strongly.
- Other: only when none applies.

Respond with one JSON object only:
{
  "documentType": "receipt|invoice|bank_statement|contract|tax_form|correspondence|other",
  "confidence": 0.0-1.0
}

Document text:
`;

/**
 * Parse and validate the classification response
 */
function parseClassificationResponse(rawResponse: string): ClassificationResult {
  const parsed = parseJsonResponse<{
    documentType?: string;
    confidence?: number | string;
    reasoning?: string;
  }>(rawResponse);

  // Validate and normalize document type
  const candidateType = parsed.documentType ?? "";
  const documentType: DocumentType = isValidDocumentType(candidateType)
    ? candidateType
    : "other";

  // Validate confidence
  let confidence = parseFloat(String(parsed.confidence ?? "0"));
  if (isNaN(confidence) || confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  return {
    documentType,
    confidence,
    reasoning: parsed.reasoning || "Structured JSON classification output",
  };
}

/**
 * Classify a document based on its text content
 *
 * @param rawText - The raw text extracted from the document via OCR
 * @returns Promise resolving to ClassificationResult
 */
export async function classifyDocument(
  rawText: string
): Promise<ClassificationResult> {
  // Handle empty or very short text
  if (!rawText || rawText.trim().length < 10) {
    return {
      documentType: "other",
      confidence: 0,
      reasoning: "Document text is empty or too short to classify",
    };
  }

  const model = getGeminiModel();

  // Limit text length to avoid token limits
  const truncatedText = rawText.slice(0, 7000);
  const prompt = CLASSIFICATION_PROMPT + truncatedText;

  try {
    const { parsed } = await generateStructuredJson({
      model,
      prompt,
      schema: classificationResponseSchema,
      label: "classification",
      attempts: [
        { temperature: 0, maxOutputTokens: 1200 },
        {
          temperature: 0,
          maxOutputTokens: 2000,
          promptSuffix:
            "Return one JSON object only. Do not add prose before or after JSON.",
        },
      ],
      parser: parseClassificationResponse,
    });

    return parsed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof StructuredJsonError && error.diagnostics?.finishReason) {
      console.error(
        `Classification finish reason: ${error.diagnostics.finishReason}` +
          (error.diagnostics.finishMessage
            ? ` (${error.diagnostics.finishMessage})`
            : "")
      );
    }
    console.error(`Classification error: ${errorMessage}`);

    // Return a default classification on error
    return {
      documentType: "other",
      confidence: 0,
      reasoning: `Classification failed: ${errorMessage}`,
    };
  }
}
