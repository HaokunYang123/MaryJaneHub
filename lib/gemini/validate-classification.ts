/**
 * Post-Classification Validation
 *
 * Rule-based validation to catch obvious misclassifications
 * for all document types: receipts, invoices, bank statements,
 * contracts, tax forms, and correspondence.
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
 * Bank statement indicators
 */
const BANK_STATEMENT_INDICATORS = [
  // Bank names
  "chase", "bank of america", "wells fargo", "citibank", "citi bank",
  "capital one", "us bank", "pnc", "td bank", "truist", "regions",
  "fifth third", "keybank", "huntington", "m&t bank", "citizens bank",
  "first republic", "svb", "silicon valley bank", "ally bank",
  // Statement keywords
  "account statement", "monthly statement", "statement period",
  "beginning balance", "ending balance", "opening balance", "closing balance",
  "available balance", "current balance", "ledger balance",
  "deposits", "withdrawals", "credits", "debits",
  "account number", "routing number", "aba number",
  "direct deposit", "wire transfer", "ach",
  "checking account", "savings account", "money market",
];

/**
 * Contract/legal agreement indicators
 */
const CONTRACT_INDICATORS = [
  // Legal terms
  "agreement", "contract", "hereby", "whereas", "therefore",
  "party", "parties", "between", "witnesseth",
  "term", "termination", "obligations", "responsibilities",
  "governing law", "jurisdiction", "arbitration", "dispute",
  "indemnify", "indemnification", "liability", "warrant", "warrants",
  "confidential", "non-disclosure", "nda",
  "execute", "executed", "execution", "effective date",
  "witness", "witnessed", "notary", "notarized",
  // Signature related
  "signature", "signed by", "sign below", "authorized signatory",
  "print name", "date signed",
  // Agreement types
  "lease agreement", "rental agreement", "service agreement",
  "employment agreement", "consulting agreement", "purchase agreement",
  "license agreement", "partnership agreement",
];

/**
 * Tax form indicators
 */
const TAX_FORM_INDICATORS = [
  // IRS form numbers
  "w-2", "w2", "w-9", "w9", "w-4", "w4",
  "1099", "1099-misc", "1099-nec", "1099-int", "1099-div", "1099-k",
  "1040", "1040-sr", "1040-es",
  "940", "941", "943", "944", "945",
  "schedule c", "schedule k-1", "schedule e",
  // Tax terminology
  "ein", "employer identification number",
  "ssn", "social security number", "social security wages",
  "federal income tax withheld", "state income tax withheld",
  "wages", "tips", "compensation", "taxable income",
  "adjusted gross income", "agi",
  "withholding", "allowances", "exemptions",
  "irs", "internal revenue service", "internal revenue",
  "tax year", "fiscal year", "tax period",
  "omb", "omb no", "form approved",
  "department of the treasury",
];

/**
 * Correspondence/letter indicators
 */
const CORRESPONDENCE_INDICATORS = [
  // Salutations
  "dear", "to whom it may concern", "attention:",
  // Closings
  "sincerely", "best regards", "regards", "respectfully",
  "thank you for your", "we appreciate",
  // Format indicators
  "re:", "subject:", "from:", "to:", "date:",
  "memo", "memorandum", "notice", "notification",
  // Letter content
  "please be advised", "this letter", "we are writing",
  "in response to", "regarding your", "with reference to",
  "enclosed", "attached", "please find",
];

/**
 * Count how many indicators from a list are found in text
 */
function countIndicators(text: string, indicators: string[]): number {
  return indicators.filter((ind) => text.includes(ind)).length;
}

/**
 * Get matched indicators from a list
 */
function getMatchedIndicators(text: string, indicators: string[]): string[] {
  return indicators.filter((ind) => text.includes(ind));
}

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

  // Count indicators for each type
  const receiptCount = countIndicators(textLower, RECEIPT_INDICATORS);
  const invoiceCount = countIndicators(textLower, INVOICE_INDICATORS);
  const bankStatementCount = countIndicators(textLower, BANK_STATEMENT_INDICATORS);
  const contractCount = countIndicators(textLower, CONTRACT_INDICATORS);
  const taxFormCount = countIndicators(textLower, TAX_FORM_INDICATORS);
  const correspondenceCount = countIndicators(textLower, CORRESPONDENCE_INDICATORS);

  // Check for food keywords
  const hasFoodKeyword = FOOD_KEYWORDS.some(
    (kw) => vendor.includes(kw) || textLower.includes(kw)
  );

  // ==========================================
  // RECEIPT vs INVOICE validation
  // ==========================================

  // Rule 1: Invoice classified as food vendor → Receipt
  if (classifiedType === "invoice" && hasFoodKeyword) {
    if (invoiceCount < 2) {
      return {
        originalType: "invoice",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: `Food/restaurant vendor "${vendorName || "detected"}" with only ${invoiceCount} invoice indicators`,
      };
    }
  }

  // Rule 2: Invoice with many receipt indicators and few invoice indicators
  if (classifiedType === "invoice") {
    if (receiptCount >= 3 && invoiceCount <= 1) {
      return {
        originalType: "invoice",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: `Found ${receiptCount} receipt indicators vs ${invoiceCount} invoice indicators`,
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
      if (invoiceCount < 2) {
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

    if ((hasPaymentMethod || hasChangeDue) && invoiceCount < 2) {
      return {
        originalType: "invoice",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: "Payment method shown indicates completed transaction",
      };
    }
  }

  // ==========================================
  // BANK STATEMENT validation
  // ==========================================

  // Rule: Something classified as correspondence/other but has strong bank statement indicators
  if (classifiedType === "correspondence" || classifiedType === "other") {
    if (bankStatementCount >= 4) {
      // Must have account number pattern and statement period language
      const hasAccountNumber = /account\s*(number|#|no)?[:\s]*[\d*xX]{4,}/i.test(rawText);
      const hasStatementPeriod = /statement\s*period|period\s*ending|through/i.test(rawText);

      if (hasAccountNumber && hasStatementPeriod) {
        return {
          originalType: classifiedType,
          validatedType: "bank_statement",
          wasCorrected: true,
          correctionReason: `Found ${bankStatementCount} bank statement indicators with account number and statement period`,
        };
      }
    }
  }

  // ==========================================
  // TAX FORM validation
  // ==========================================

  // Rule: Strong tax form number presence should override other classifications
  if (classifiedType !== "tax_form") {
    // Check for specific IRS form numbers
    const hasIRSFormNumber = /\b(w-?2|w-?9|w-?4|1099|1040|940|941|schedule\s+[a-z])/i.test(rawText);
    const hasEIN = /\bein\b|employer\s+identification/i.test(rawText);
    const hasTaxWithholding = /federal\s+(income\s+)?tax\s+withheld|state\s+tax\s+withheld/i.test(rawText);

    if (hasIRSFormNumber && (taxFormCount >= 3 || (hasEIN && hasTaxWithholding))) {
      return {
        originalType: classifiedType,
        validatedType: "tax_form",
        wasCorrected: true,
        correctionReason: `IRS form number detected with ${taxFormCount} tax form indicators`,
      };
    }
  }

  // ==========================================
  // CONTRACT validation
  // ==========================================

  // Rule: Strong contract indicators with legal language
  if (classifiedType === "correspondence" || classifiedType === "other") {
    if (contractCount >= 5) {
      const hasParties = /between\s+.+\s+and\s+/i.test(rawText) || /party|parties/i.test(rawText);
      const hasSignatureSection = /signature|sign\s+below|executed|witness/i.test(rawText);

      if (hasParties && hasSignatureSection) {
        return {
          originalType: classifiedType,
          validatedType: "contract",
          wasCorrected: true,
          correctionReason: `Found ${contractCount} contract indicators with parties and signature elements`,
        };
      }
    }
  }

  // ==========================================
  // OTHER → INVOICE validation
  // ==========================================

  // Rule: "other" with strong invoice indicators → Invoice
  if (classifiedType === "other") {
    if (invoiceCount >= 3) {
      return {
        originalType: "other",
        validatedType: "invoice",
        wasCorrected: true,
        correctionReason: `Found ${invoiceCount} invoice indicators: document appears to be an invoice`,
      };
    }
  }

  // ==========================================
  // OTHER → RECEIPT validation
  // ==========================================

  // Rule: "other" with strong receipt indicators → Receipt
  if (classifiedType === "other") {
    if (receiptCount >= 3 || (hasFoodKeyword && receiptCount >= 2)) {
      return {
        originalType: "other",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: `Found ${receiptCount} receipt indicators${hasFoodKeyword ? " with food vendor" : ""}`,
      };
    }
  }

  // ==========================================
  // Cross-type validation
  // ==========================================

  // Rule: Receipt classified as bank_statement (unlikely but check)
  if (classifiedType === "bank_statement") {
    if (receiptCount >= 4 && bankStatementCount <= 2 && hasFoodKeyword) {
      return {
        originalType: "bank_statement",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: "Food vendor with receipt indicators misclassified as bank statement",
      };
    }
  }

  // Rule: Receipt classified as contract (unlikely but check)
  if (classifiedType === "contract") {
    if (receiptCount >= 4 && contractCount <= 2 && hasFoodKeyword) {
      return {
        originalType: "contract",
        validatedType: "receipt",
        wasCorrected: true,
        correctionReason: "Food vendor with receipt indicators misclassified as contract",
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
  bankStatementIndicators: string[];
  contractIndicators: string[];
  taxFormIndicators: string[];
  correspondenceIndicators: string[];
  foodKeywords: string[];
  suggestedType: DocumentType | "unclear";
  indicatorCounts: Record<string, number>;
} {
  const textLower = rawText.toLowerCase();
  const vendor = (vendorName || "").toLowerCase();

  const foundReceiptIndicators = getMatchedIndicators(textLower, RECEIPT_INDICATORS);
  const foundInvoiceIndicators = getMatchedIndicators(textLower, INVOICE_INDICATORS);
  const foundBankStatementIndicators = getMatchedIndicators(textLower, BANK_STATEMENT_INDICATORS);
  const foundContractIndicators = getMatchedIndicators(textLower, CONTRACT_INDICATORS);
  const foundTaxFormIndicators = getMatchedIndicators(textLower, TAX_FORM_INDICATORS);
  const foundCorrespondenceIndicators = getMatchedIndicators(textLower, CORRESPONDENCE_INDICATORS);

  const foundFoodKeywords = FOOD_KEYWORDS.filter(
    (kw) => vendor.includes(kw) || textLower.includes(kw)
  );

  const indicatorCounts = {
    receipt: foundReceiptIndicators.length,
    invoice: foundInvoiceIndicators.length,
    bank_statement: foundBankStatementIndicators.length,
    contract: foundContractIndicators.length,
    tax_form: foundTaxFormIndicators.length,
    correspondence: foundCorrespondenceIndicators.length,
    food_keywords: foundFoodKeywords.length,
  };

  // Determine suggested type based on indicators
  let suggestedType: DocumentType | "unclear";

  // Check for IRS form numbers first (strongest indicator for tax forms)
  const hasIRSFormNumber = /\b(w-?2|w-?9|w-?4|1099|1040|940|941|schedule\s+[a-z])/i.test(rawText);
  if (hasIRSFormNumber && foundTaxFormIndicators.length >= 2) {
    suggestedType = "tax_form";
  }
  // Bank statement: look for account number pattern + statement period
  else if (
    foundBankStatementIndicators.length >= 4 &&
    /account\s*(number|#|no)?[:\s]*[\d*xX]{4,}/i.test(rawText)
  ) {
    suggestedType = "bank_statement";
  }
  // Contract: legal language + parties + signature
  else if (
    foundContractIndicators.length >= 4 &&
    (/between\s+.+\s+and\s+/i.test(rawText) || /party|parties/i.test(rawText))
  ) {
    suggestedType = "contract";
  }
  // Food vendor with receipt indicators
  else if (foundFoodKeywords.length > 0 && foundInvoiceIndicators.length < 2) {
    suggestedType = "receipt";
  }
  // Strong invoice indicators
  else if (foundInvoiceIndicators.length >= 3) {
    suggestedType = "invoice";
  }
  // Strong receipt indicators
  else if (foundReceiptIndicators.length >= 3) {
    suggestedType = "receipt";
  }
  // Moderate invoice indicators
  else if (foundInvoiceIndicators.length >= 2) {
    suggestedType = "invoice";
  }
  // Moderate receipt indicators
  else if (foundReceiptIndicators.length >= 2) {
    suggestedType = "receipt";
  }
  // Correspondence as fallback if it has indicators
  else if (foundCorrespondenceIndicators.length >= 2) {
    suggestedType = "correspondence";
  }
  // Unclear
  else {
    suggestedType = "unclear";
  }

  return {
    receiptIndicators: foundReceiptIndicators,
    invoiceIndicators: foundInvoiceIndicators,
    bankStatementIndicators: foundBankStatementIndicators,
    contractIndicators: foundContractIndicators,
    taxFormIndicators: foundTaxFormIndicators,
    correspondenceIndicators: foundCorrespondenceIndicators,
    foodKeywords: foundFoodKeywords,
    suggestedType,
    indicatorCounts,
  };
}
