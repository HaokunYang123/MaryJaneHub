import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ClassificationResult, DocumentType } from "./document-types";
import { DOCUMENT_TYPE_DESCRIPTIONS, isValidDocumentType } from "./document-types";

const CLASSIFICATION_PROMPT = `You are a document classifier for financial documents. Classify the following document into exactly ONE category.

## Categories and Criteria:

### RECEIPT
A receipt is PROOF OF COMPLETED PAYMENT. Key indicators:
- Contains "Thank you", "Thanks for visiting", "Come again"
- Shows "PAID", "CASH", "CREDIT CARD", "CHANGE DUE", "TIP"
- Has transaction/register number, server name, table number
- Printed from POS/cash register system (looks like thermal paper printout)
- Consumer retail context: restaurants, stores, gas stations, coffee shops
- Shows subtotal + tax + tip + total as final amounts (NOT amounts due)
- Date/time of transaction present
- NO "Due Date", "Payment Terms", "Net 30", or "Amount Due"
- Restaurant/food establishments are ALMOST ALWAYS receipts

### INVOICE
An invoice is a REQUEST FOR PAYMENT (payment NOT yet made). Key indicators:
- Contains "Invoice #", "Invoice Number", "Bill To", "Ship To"
- Shows "Due Date", "Payment Terms", "Net 30", "Net 15"
- Has "Amount Due", "Balance Due", "Please Pay", "Remit To"
- Generated from accounting/billing system
- B2B context: contractors, suppliers, professional services
- May include payment instructions (bank details, check address)
- Often has formal letterhead with company logo
- Customer ID, account number for billing purposes

### BANK_STATEMENT
- From a bank or financial institution
- Shows account number, statement period
- Lists transactions over a time period
- Shows beginning/ending balance

### CONTRACT
- Legal agreement between parties
- Contains terms, conditions, signatures
- References obligations and rights

### TAX_FORM
- Government tax document (W2, 1099, etc.)
- Contains tax ID numbers, withholding amounts
- Official form layout

### CORRESPONDENCE
- Letters, emails, notices
- General communication not primarily financial

## CRITICAL Rules for Receipt vs Invoice:

1. **Restaurant/Food/Retail = RECEIPT** (unless explicitly unpaid bill)
   - Any document from: restaurants, cafes, bars, grills, diners, fast food, coffee shops, retail stores → RECEIPT
   - Keywords: restaurant, cafe, grill, kitchen, diner, pizza, burger, taco, sushi, buffet, tavern, bistro, bar

2. **Payment Method Shown = RECEIPT**
   - If document shows: CASH, CREDIT, DEBIT, VISA, MASTERCARD, AMEX, CHANGE → RECEIPT
   - These indicate payment was COMPLETED

3. **No "Due Date" or "Amount Due" = Likely RECEIPT**
   - Invoices ALWAYS have due dates or amount due
   - If missing, it's probably a receipt

4. **"Thank You" or "Come Again" = RECEIPT**
   - These phrases only appear on receipts, never on invoices

## Output Format:
Respond with JSON only, no markdown:
{
  "documentType": "receipt|invoice|bank_statement|contract|tax_form|correspondence|other",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of key indicators found"
}

## Document Text:
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
