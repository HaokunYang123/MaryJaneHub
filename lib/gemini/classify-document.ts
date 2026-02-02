import type { ClassificationResult, DocumentType } from "./document-types";
import { isValidDocumentType } from "./document-types";
import { getGeminiModel, cleanJsonResponse } from "./client";
import { generateContentWithTimeout } from "./call";

const CLASSIFICATION_PROMPT = `You are an expert document classifier for financial and business documents. Classify the following document into exactly ONE category.

## Categories and Detailed Criteria:

### RECEIPT (Proof of Completed Payment)
**Key Indicators:**
- "Thank you", "Thanks for visiting", "Come again", "Have a nice day"
- "PAID", "CASH", "CREDIT CARD", "DEBIT", "CHANGE DUE", "TIP"
- Transaction #, Register #, Terminal ID
- Server/Cashier name, Table #, Guests count
- Subtotal + Tax + Tip + Total (as final paid amounts)
- Date and time of transaction
- POS/cash register format

**Common Sources:**
- Restaurants, cafes, coffee shops, bars
- Retail stores, grocery stores
- Gas stations, convenience stores
- Hotels (checkout folios)
- Parking, tolls

**NOT a Receipt if:** Has "Due Date", "Amount Due", "Please Pay By", "Invoice #"

---

### INVOICE (Request for Payment)
**Key Indicators:**
- "Invoice", "Invoice #", "Invoice Number", "Bill"
- "Bill To:", "Ship To:", "Sold To:"
- "Due Date", "Payment Due", "Pay By"
- "Payment Terms": Net 30, Net 15, Due on Receipt
- "Amount Due", "Balance Due", "Total Due"
- "Remit To", "Pay To", "Payment Instructions"
- Purchase Order (PO) number reference
- Formal letterhead with company address

**Common Sources:**
- Contractors, service providers
- Suppliers, vendors
- Professional services (legal, accounting, consulting)
- Utilities (if showing amount due)
- B2B transactions

**NOT an Invoice if:** Shows payment already made, has "Thank you for your payment"

---

### BANK_STATEMENT (Account Activity Report)
**Key Indicators:**
- Bank name and logo (Chase, Bank of America, Wells Fargo, etc.)
- "Statement", "Account Statement", "Monthly Statement"
- Account Number (usually partially masked: ****1234)
- Statement Period: "January 1 - January 31, 2024"
- Beginning Balance, Ending Balance
- List of transactions with dates and descriptions
- Deposits, Withdrawals, Credits, Debits
- "Available Balance", "Current Balance"

**Common Sources:**
- Commercial banks
- Credit unions
- Credit card statements
- Investment account statements
- Brokerage statements

**NOT a Bank Statement if:** Single transaction only, no account number, no statement period

---

### CONTRACT (Legal Agreement)
**Key Indicators:**
- "Agreement", "Contract", "Terms and Conditions"
- "Party", "Parties", "Between [X] and [Y]"
- "Whereas", "Therefore", "Hereby"
- "Effective Date", "Term", "Duration"
- "Obligations", "Rights", "Responsibilities"
- "Termination", "Cancellation", "Breach"
- Signature lines, "Signed by", "Witnessed by"
- Dates of execution
- Legal language and formal structure
- "Governing Law", "Jurisdiction", "Arbitration"

**Common Types:**
- Lease agreements (property, equipment)
- Service agreements
- Employment contracts
- Non-disclosure agreements (NDA)
- Partnership agreements
- Purchase agreements

**NOT a Contract if:** No signature lines, no parties identified, just a proposal/quote

---

### TAX_FORM (Government Tax Document)
**Key Indicators:**
- IRS form numbers: W-2, W-9, 1099, 1040, 940, 941
- State tax form identifiers
- "Tax Year", "Fiscal Year"
- Employer Identification Number (EIN)
- Social Security Number (usually masked)
- "Wages", "Tips", "Compensation"
- "Federal Income Tax Withheld", "State Tax Withheld"
- "Taxable Income", "Adjusted Gross Income"
- Official government form layout
- OMB control numbers

**Common Forms:**
- W-2 (Employee wage statement)
- 1099-MISC, 1099-NEC, 1099-INT, 1099-DIV
- W-9 (Tax ID request)
- 1040 (Individual tax return)
- Schedule C, K-1
- State equivalents

**NOT a Tax Form if:** Internal company document, no official form number

---

### CORRESPONDENCE (General Communication)
**Key Indicators:**
- Letter format with date, salutation, body, signature
- "Dear [Name]", "To Whom It May Concern"
- "Sincerely", "Best Regards", "Thank you"
- Memo format: To, From, Date, Subject
- Email printout
- Notice, Notification, Announcement
- No specific financial transaction data

**Common Types:**
- Business letters
- Legal notices
- Government correspondence
- Internal memos
- Customer communications
- Confirmation letters (non-financial)

**Use as Default:** If document doesn't clearly fit other categories

---

## Classification Rules (Priority Order):

1. **Look for definitive markers first:**
   - Bank logo + account number + statement period → BANK_STATEMENT
   - IRS form number (W-2, 1099, etc.) → TAX_FORM
   - Signature lines + legal language + parties → CONTRACT
   - "Amount Due" + "Due Date" + "Invoice #" → INVOICE
   - "Thank you" + payment method + restaurant/retail → RECEIPT

2. **Consider the source:**
   - From a bank → Likely BANK_STATEMENT
   - From IRS/government → Likely TAX_FORM
   - From restaurant/retail → Almost always RECEIPT
   - From contractor/service provider → Check for INVOICE indicators

3. **When uncertain between two types:**
   - Receipt vs Invoice: Did payment happen? Receipt. Is payment requested? Invoice.
   - Contract vs Correspondence: Are there obligations/signatures? Contract.
   - Bank Statement vs Correspondence: Is there account activity? Bank Statement.

4. **Confidence scoring:**
   - 0.95+: Multiple strong indicators, no conflicting signals
   - 0.85-0.94: Clear indicators present
   - 0.70-0.84: Some indicators, minor ambiguity
   - Below 0.70: Significant ambiguity, flag for review

## Output Format:
Respond with JSON only, no markdown:
{
  "documentType": "receipt|invoice|bank_statement|contract|tax_form|correspondence|other",
  "confidence": 0.0-1.0,
  "reasoning": "Key indicators: [list what you found]. Classification because: [brief explanation]"
}

## Document Text:
`;

/**
 * Parse and validate the classification response
 */
function parseClassificationResponse(rawResponse: string): ClassificationResult {
  const cleaned = cleanJsonResponse(rawResponse);
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
  const truncatedText = rawText.slice(0, 8000);
  const prompt = CLASSIFICATION_PROMPT + truncatedText;

  try {
    const result = await generateContentWithTimeout(model, prompt);
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
