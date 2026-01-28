import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ClassificationResult, DocumentType } from "./document-types.js";
import { DOCUMENT_TYPE_DESCRIPTIONS, isValidDocumentType } from "./document-types.js";

const CLASSIFICATION_PROMPT = `You are a document classification assistant. Analyze the following document text and determine its type.

DOCUMENT TYPES:
${Object.entries(DOCUMENT_TYPE_DESCRIPTIONS)
  .map(([type, desc]) => `- ${type}: ${desc}`)
  .join("\n")}

INSTRUCTIONS:
1. Read the document text carefully
2. Identify key characteristics (amounts, dates, parties, purpose)
3. Determine the most likely document type
4. Provide a confidence score (0.0 to 1.0)
5. Give a brief reasoning for your classification

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- If the document is unclear or doesn't fit well, use "other" with lower confidence
- Be precise with the document type - invoices request payment, receipts confirm payment

Return this exact JSON structure:
{
  "documentType": "invoice|receipt|bank_statement|contract|tax_form|correspondence|other",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of why this type was chosen"
}

DOCUMENT TEXT:
`;

/**
 * Parse and validate the classification response
 */
function parseClassificationResponse(rawResponse: string): ClassificationResult {
  // Clean up response - remove markdown code blocks if present
  let cleaned = rawResponse.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);

  // Validate and normalize document type
  const documentType: DocumentType = isValidDocumentType(parsed.documentType)
    ? parsed.documentType
    : "other";

  // Validate confidence
  let confidence = parseFloat(parsed.confidence);
  if (isNaN(confidence) || confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  return {
    documentType,
    confidence,
    reasoning: parsed.reasoning || "No reasoning provided",
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  // Handle empty or very short text
  if (!rawText || rawText.trim().length < 10) {
    return {
      documentType: "other",
      confidence: 0,
      reasoning: "Document text is empty or too short to classify",
    };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Limit text length to avoid token limits
  const truncatedText = rawText.slice(0, 8000);
  const prompt = CLASSIFICATION_PROMPT + truncatedText;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response;
    const rawResponse = response.text();

    return parseClassificationResponse(rawResponse);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Classification error: ${errorMessage}`);

    // Return a default classification on error
    return {
      documentType: "other",
      confidence: 0,
      reasoning: `Classification failed: ${errorMessage}`,
    };
  }
}
