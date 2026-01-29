/**
 * Post-Classification Validation
 *
 * Rule-based validation to catch obvious misclassifications,
 * particularly restaurant receipts incorrectly classified as invoices.
 */

import type { DocumentType } from "./document-types";

export interface ValidationResult {
  originalType: DocumentType;
  validatedType: DocumentType;
  wasCorrected: boolean;
  correctionReason?: string;
}

/**
 * Food/restaurant keywords that strongly indicate a receipt
 */
const FOOD_KEYWORDS = [
  // Establishment types
  "restaurant", "cafe", "coffee", "grill", "kitchen", "diner", "pizza",
  "burger", "taco", "sushi", "buffet", "bakery", "steakhouse", "seafood",
  "bbq", "bar", "pub", "bistro", "eatery", "tavern", "cantina", "trattoria",
  "brasserie", "chophouse", "brewpub", "brewery", "ramen", "noodle",
  "ristorante", "osteria", "pizzeria", "gelateria", "calogero",
  // Cuisine types
  "thai", "chinese", "mexican", "indian", "italian", "japanese", "korean",
  "vietnamese", "french", "greek", "mediterranean", "spanish", "cuban",
  // Brand names
  "wendys", "mcdonalds", "starbucks", "chipotle", "subway", "chilis",
  "applebees", "dennys", "ihop", "outback", "olive garden", "red lobster",
  "tgi fridays", "buffalo wild wings", "panera", "in-n-out", "innout",
  "five guys", "shake shack", "carls jr", "carl's jr", "jack in the box",
  "taco bell", "del taco", "panda express", "kfc", "popeyes", "arbys",
  // Generic food words
  "wings", "grill", "palace", "house", "inn", "family restaurant",
];

/**
 * Receipt indicators in document text
 */
const RECEIPT_INDICATORS = [
  "thank you", "thanks for", "come again", "please come again",
  "change due", "change:", "cash tendered", "amount tendered",
  "credit card", "debit card", "visa", "mastercard", "amex", "discover",
  "tip:", "tip amount", "gratuity", "server:", "table:", "guests:",
  "check #", "check number", "order #", "order number",
  "subtotal", "sub total", "tax:", "total:", "grand total",
  "receipt", "transaction", "terminal", "register",
  "dine in", "take out", "to go", "carryout", "delivery",
];

/**
 * Invoice indicators in document text
 */
const INVOICE_INDICATORS = [
  "invoice #", "invoice number", "inv #", "inv no",
  "bill to", "bill to:", "ship to", "ship to:",
  "due date", "payment due", "due on", "due by",
  "payment terms", "terms:", "net 30", "net 15", "net 60",
  "amount due", "balance due", "total due", "please pay",
  "remit to", "remit payment", "remittance",
  "purchase order", "po #", "po number",
  "account number", "customer id", "customer #",
];

/**
 * Validate a classification result and potentially correct it
 *
 * @param classifiedType - The type returned by Gemini
 * @param confidence - The confidence score
 * @param rawText - The raw OCR text
 * @param vendorName - The extracted vendor name (optional)
 * @returns ValidationResult with potential correction
 */
export function validateClassification(
  classifiedType: DocumentType,
  confidence: number,
  rawText: string,
  vendorName?: string | null
): ValidationResult {
  const textLower = rawText.toLowerCase();
  const vendor = (vendorName || "").toLowerCase();

  // Count indicators
  const receiptIndicatorCount = RECEIPT_INDICATORS.filter((ind) =>
    textLower.includes(ind)
  ).length;

  const invoiceIndicatorCount = INVOICE_INDICATORS.filter((ind) =>
    textLower.includes(ind)
  ).length;

  // Check for food keywords
  const hasFoodKeyword = FOOD_KEYWORDS.some(
    (kw) => vendor.includes(kw) || textLower.includes(kw)
  );

  // Rule 1: Invoice classified as food vendor → Receipt
  if (classifiedType === "invoice" && hasFoodKeyword) {
    // Only keep as invoice if it has strong invoice indicators
    if (invoiceIndicatorCount < 2) {
      return {
        originalType: "invoice",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: `Food/restaurant vendor "${vendorName || "detected"}" with only ${invoiceIndicatorCount} invoice indicators`,
      };
    }
  }

  // Rule 2: Invoice with many receipt indicators and few invoice indicators
  if (classifiedType === "invoice") {
    if (receiptIndicatorCount >= 3 && invoiceIndicatorCount <= 1) {
      return {
        originalType: "invoice",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: `Found ${receiptIndicatorCount} receipt indicators vs ${invoiceIndicatorCount} invoice indicators`,
      };
    }
  }

  // Rule 3: Invoice with "thank you" or "come again" → Receipt
  if (classifiedType === "invoice") {
    if (
      textLower.includes("thank you") ||
      textLower.includes("come again") ||
      textLower.includes("thanks for")
    ) {
      if (invoiceIndicatorCount < 2) {
        return {
          originalType: "invoice",
          validatedType: "receipt",
          wasCorrected: true,
          correctionReason: 'Contains "thank you" or "come again" with few invoice indicators',
        };
      }
    }
  }

  // Rule 4: Invoice with payment method shown → Receipt
  if (classifiedType === "invoice") {
    const paymentMethods = ["visa", "mastercard", "amex", "cash", "debit", "credit card"];
    const hasPaymentMethod = paymentMethods.some((pm) => textLower.includes(pm));
    const hasChangeDue = textLower.includes("change") && textLower.includes("due");

    if ((hasPaymentMethod || hasChangeDue) && invoiceIndicatorCount < 2) {
      return {
        originalType: "invoice",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: "Payment method shown indicates completed transaction",
      };
    }
  }

  // No correction needed
  return {
    originalType: classifiedType,
    validatedType: classifiedType,
    wasCorrected: false,
  };
}

/**
 * Get detailed classification analysis for debugging
 */
export function analyzeClassification(
  rawText: string,
  vendorName?: string | null
): {
  receiptIndicators: string[];
  invoiceIndicators: string[];
  foodKeywords: string[];
  suggestedType: "receipt" | "invoice" | "unclear";
} {
  const textLower = rawText.toLowerCase();
  const vendor = (vendorName || "").toLowerCase();

  const foundReceiptIndicators = RECEIPT_INDICATORS.filter((ind) =>
    textLower.includes(ind)
  );

  const foundInvoiceIndicators = INVOICE_INDICATORS.filter((ind) =>
    textLower.includes(ind)
  );

  const foundFoodKeywords = FOOD_KEYWORDS.filter(
    (kw) => vendor.includes(kw) || textLower.includes(kw)
  );

  let suggestedType: "receipt" | "invoice" | "unclear";

  if (foundFoodKeywords.length > 0 && foundInvoiceIndicators.length < 2) {
    suggestedType = "receipt";
  } else if (foundInvoiceIndicators.length >= 2) {
    suggestedType = "invoice";
  } else if (foundReceiptIndicators.length >= 2) {
    suggestedType = "receipt";
  } else {
    suggestedType = "unclear";
  }

  return {
    receiptIndicators: foundReceiptIndicators,
    invoiceIndicators: foundInvoiceIndicators,
    foodKeywords: foundFoodKeywords,
    suggestedType,
  };
}
