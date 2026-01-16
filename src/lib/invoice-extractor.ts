import { classifierModel, deepExtractionModel, visionModel, expertAnalysisModel } from '@/lib/gemini';

export interface AIAnalysisResult {
  isFinancial: boolean;
  summary: string;
  filingCategory: string;
  confidence: number;
  data: {
    vendorName: string;
    amount: number;
    date: string;
    description: string;
  };
}

// Tier 1 Classification Result
export interface Tier1Result {
  category: string;
  subcategory: string;
  needs_deep_analysis: boolean;
}

// Tier 2 Deep Extraction Result - Simplified for Mary's business
export interface Tier2Result {
  vendorName: string;
  amount: number;
  date: string;
  description: string;
  // Simplified folder structure (max 3 levels)
  category: "Dispensary" | "Properties" | "Payroll" | "Banking" | "Legal" | "Taxes" | "Other";
  property?: string; // Property name/location - can be any string (e.g., "Riverside", "Phoenix", "Arizona Rental")
  expenseType?: string; // e.g., "Repairs", "Utilities", "Inventory" - only when relevant
  // Does this need to go to QuickBooks for bookkeeping?
  needsBookkeeping: boolean;
  // Confidence score (0.0 to 1.0) - triggers Tier 3 if < 0.70
  confidence: number;
  // Flag if Tier 3 was used
  usedTier3?: boolean;
}

// Legacy interface
export interface ExtractedInvoice {
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }[];
  suggestedCategory: string;
  taxClass: "COGS - Deductible" | "OpEx - Non-Deductible";
}

// ============================================================
// SINGLE SOURCE OF TRUTH: Allowed folder/category names
// These map to folders inside "Invoices/" in Google Drive
// ============================================================
export const ALLOWED_FOLDERS = [
  "Property Invoices",
  "Repair Invoices",
  "Utility Invoices",
  "Inventory Invoices",
  "Legal Documents",
  "Payroll Documents",
  "Tax Documents",
  "Administrative"
] as const;

export type AllowedFolder = typeof ALLOWED_FOLDERS[number];

// --- GEMINI VISION: Convert Buffer to Base64 for the API ---
function fileToPart(buffer: Buffer, mimeType: string) {
  return {
    inlineData: {
      data: buffer.toString("base64"),
      mimeType
    },
  };
}

// Alias for backward compatibility
const fileToGenerativePart = fileToPart;

/**
 * TIER 1: Cheap Classification ($0.00001 per file)
 * Uses gemini-2.0-flash-lite for fast, low-cost classification
 */
export async function runTier1(buffer: Buffer, mimeType: string): Promise<Tier1Result> {
  const prompt = `Classify this document.

  CLASSIFICATION CATEGORIES:
  - financial_actionable: Bills, invoices, receipts that need payment
  - financial_reference: Bank statements, reports (no action needed)
  - legal: Contracts, agreements, legal documents
  - government: Permits, licenses, government notices
  - personal: Personal documents
  - unknown: Cannot determine
  
  IMPORTANT: For the 'subcategory' field, you MUST use one of these exact folder names:
  ${ALLOWED_FOLDERS.join(", ")}
  
  - "Property Repairs": Use for any fix or maintenance (e.g., AC Repair, plumbing).
  - "Utilities": Use for electric, gas, internet, water bills.
  - "Inventory": Use for supplies, seeds, nutrients, wholesale goods.
  - "Administrative": Use for permits, notices, or general docs.
  - "Legal": Use for contracts, agreements, legal documents.
  - "Payroll": Use for employee wages, benefits, HR docs.
  - "Taxes": Use for tax forms, filings, or tax-related docs.
  
  Return ONLY raw JSON:
  {"category": "string", "subcategory": "one of the exact folder names above", "needs_deep_analysis": boolean}
  
  Set needs_deep_analysis to TRUE only for financial_actionable documents.`;

  try {
    const result = await classifierModel.generateContent([prompt, fileToPart(buffer, mimeType)]);
    const response = result.response.text();
    const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Tier 1 Classification Failed:", error);
    return { category: "unknown", subcategory: "Administrative", needs_deep_analysis: false };
  }
}

/**
 * TIER 3: Expert Analysis with Gemini 2.5 Pro
 * Used for complex, ambiguous, or low-quality documents when Tier 2 confidence < 70%
 */
export async function runTier3(buffer: Buffer, mimeType: string): Promise<Tier2Result> {
  const prompt = `You are an expert document analyst specializing in complex, ambiguous, or low-quality documents. You are the final review tier after two previous AI systems flagged this document as uncertain. Your job is to make a definitive classification decision.

CONTEXT: Mary is a 70-year-old entrepreneur running 8 businesses:
- Cannabis dispensaries (Green Leaf Wellness in CA)
- Rental properties (CA, AZ, and other locations)
- Distribution (MJ Distribution LLC - cannabis wholesale)

YOUR TASK: Analyze this document with expert-level precision. Previous systems were uncertain, so look carefully at:
- Faded or low-quality text
- Unusual document formats
- Ambiguous vendor names or descriptions
- Documents that could fit multiple categories

EXTRACT WITH HIGH CONFIDENCE:

1. vendorName: Company or person name (look for letterhead, signatures, logos)
2. amount: Dollar amount - look for totals, subtotals, or amounts due (0 only if truly absent)
3. date: Document date in YYYY-MM-DD format
4. description: Clear description of what this document is for

5. category - Make a DEFINITIVE choice:
   - "Dispensary": Cannabis products, grow supplies, packaging, dispensary equipment
   - "Properties": Repairs, maintenance, utilities, property management, tenant-related, landlord expenses
   - "Payroll": Wages, benefits, employee expenses
   - "Banking": Bank statements (reference only)
   - "Legal": Attorney fees, legal services, contracts
   - "Taxes": IRS, tax filings, tax payments, 280E
   - "Other": ONLY if absolutely nothing else fits

6. property: If Properties category, extract location (city, property name, or address)
7. expenseType: Repairs, Utilities, Inventory, Equipment, Management, Tenant Invoice, or null
8. needsBookkeeping: TRUE if amount > 0 and it's an invoice/bill/receipt
9. confidence: YOUR confidence in this analysis (0.0 to 1.0) - be honest

Return ONLY valid JSON:
{
  "vendorName": "string",
  "amount": number,
  "date": "YYYY-MM-DD or empty string",
  "description": "string",
  "category": "Dispensary" | "Properties" | "Payroll" | "Banking" | "Legal" | "Taxes" | "Other",
  "property": "string or null",
  "expenseType": "string or null",
  "needsBookkeeping": boolean,
  "confidence": number
}`;

  try {
    console.log("🔬 TIER 3: Expert analysis with Gemini 2.5 Pro...");
    const result = await expertAnalysisModel.generateContent([prompt, fileToPart(buffer, mimeType)]);
    const response = result.response.text();
    const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      ...parsed,
      confidence: parsed.confidence || 0.85,
      usedTier3: true
    };
  } catch (error) {
    console.error("Tier 3 Expert Analysis Failed:", error);
    return {
      vendorName: "Unknown",
      amount: 0,
      date: "",
      description: "Expert analysis failed",
      category: "Other",
      property: undefined,
      expenseType: undefined,
      needsBookkeeping: false,
      confidence: 0,
      usedTier3: true
    };
  }
}

/**
 * TIER 2: Deep Extraction with Gemini 2.5 Flash
 * Customized for Mary's 8-business financial hub
 * Automatically escalates to Tier 3 if confidence < 70%
 */
export async function runTier2(buffer: Buffer, mimeType: string): Promise<Tier2Result> {
  const prompt = `You are analyzing a document for Mary's Financial Hub. Mary is an entrepreneur with multiple businesses.

MARY'S KNOWN BUSINESSES:

1. CANNABIS DISPENSARIES (Green Leaf Wellness locations in CA)
2. RENTAL PROPERTIES (multiple locations - CA, AZ, and potentially others)
3. DISTRIBUTION (MJ Distribution LLC - cannabis wholesale)

EXTRACT FROM THIS DOCUMENT:

1. vendorName: Company or person name on the document
2. amount: Dollar amount (use 0 only if truly no amount shown)
3. date: Document date (YYYY-MM-DD)
4. description: What is this for? (e.g., "AC repair unit 4", "monthly electric bill", "property management fee")

5. category - Pick the BEST match:
   - "Dispensary": Cannabis products, grow supplies, packaging, dispensary equipment
   - "Properties": ANY expense for rental properties - repairs, maintenance, utilities, property management, tenant-related, landlord expenses, rental income/invoices
   - "Payroll": Wages, benefits, employee expenses
   - "Banking": Bank statements only (reference documents)
   - "Legal": Attorney fees, legal services, lawsuits
   - "Taxes": IRS, tax filings, tax payments, 280E documents
   - "Other": ONLY use this if it truly doesn't fit ANY category above

   IMPORTANT RULES FOR CATEGORY:
   - If it's a repair invoice (AC, HVAC, plumbing, electrical, roofing), use "Properties"
   - If it mentions apartment, tenant, rental, landlord, property management, use "Properties"
   - If it mentions ANY city/location with property context, use "Properties"
   - If it's an invoice TO a tenant (rent invoice, tenant billing), use "Properties"
   - NEVER use "Other" for property-related expenses - always use "Properties"

6. property - If category is "Properties", extract the property name/location:
   - Use the city name if mentioned (e.g., "Riverside", "Phoenix", "Tucson", "Corona")
   - Use the property name if given (e.g., "Sunset Apartments", "Oak Street Rental")
   - Use the address if that's all you have (e.g., "123 Main St")
   - Use "Unknown Property" only if absolutely no location info is available
   - Set to null only if category is NOT "Properties"

7. expenseType - What kind of expense?
   - "Repairs": AC, HVAC, plumbing, electrical, roofing, appliances, maintenance, fixes
   - "Utilities": Electric, gas, water, trash, internet
   - "Inventory": Cannabis products, supplies, packaging
   - "Equipment": Machinery, tools, hardware
   - "Management": Property management fees, admin fees
   - "Tenant Invoice": Invoice sent TO a tenant (rent, fees owed by tenant)
   - null if not applicable

8. needsBookkeeping - Does this need to go to QuickBooks?
   TRUE if amount > 0 AND it's an invoice, bill, or receipt
   FALSE only for bank statements, contracts, permits, or $0 documents

9. confidence - How confident are you in this analysis? (0.0 to 1.0)
   - 0.9-1.0: Very clear document, certain about all fields
   - 0.7-0.9: Reasonably confident, most fields clear
   - 0.5-0.7: Uncertain, document is ambiguous or low quality
   - Below 0.5: Very uncertain, guessing

Return ONLY valid JSON:
{
  "vendorName": "string",
  "amount": number,
  "date": "YYYY-MM-DD or empty string",
  "description": "string",
  "category": "Dispensary" | "Properties" | "Payroll" | "Banking" | "Legal" | "Taxes" | "Other",
  "property": "string or null (any property name/location)",
  "expenseType": "string or null",
  "needsBookkeeping": true | false,
  "confidence": number
}`;

  try {
    const result = await deepExtractionModel.generateContent([prompt, fileToPart(buffer, mimeType)]);
    const response = result.response.text();
    const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
    const tier2Result = JSON.parse(cleaned);

    // Add default confidence if not provided
    const confidence = tier2Result.confidence || 0.5;

    // If confidence < 70%, escalate to Tier 3 expert analysis
    if (confidence < 0.70) {
      console.log(`⚠️ Tier 2 confidence ${(confidence * 100).toFixed(0)}% < 70%, escalating to Tier 3...`);
      return await runTier3(buffer, mimeType);
    }

    return {
      ...tier2Result,
      confidence,
      usedTier3: false
    };
  } catch (error) {
    console.error("Tier 2 Extraction Failed:", error);
    // On Tier 2 failure, try Tier 3 as fallback
    console.log("⚠️ Tier 2 failed, attempting Tier 3 expert analysis...");
    return await runTier3(buffer, mimeType);
  }
}

/**
 * Smart AI Analysis using Gemini Vision (Legacy - uses Tier 2 model)
 * Sends the raw file buffer directly to Gemini - works on scanned PDFs!
 */
export async function analyzeAndCategorize(
  fileBuffer: Buffer,
  mimeType: string,
  source: 'web' | 'drive'
): Promise<AIAnalysisResult> {

  let specificInstructions = `
    CONTEXT: The user explicitly uploaded this to the Accounting Dashboard. 
    Assume it is an invoice, receipt, or financial document. 
    Find the best possible match for Vendor and Amount.
  `;

  if (source === 'drive') {
    specificInstructions = `
      CONTEXT: This file was found in a Google Drive folder.
      FIRST, decide if this is a financial document (Invoice/Receipt/Bill) that needs payment.
      
      - IF IT IS NOT FINANCIAL (e.g., EIN Letter, Permit, Contract, Photo):
        Set "isFinancial" to false.
        Set "amount" to 0.
        Set "filingCategory" to "Administrative" or "Legal".
      
      - IF IT IS FINANCIAL:
        Set "isFinancial" to true and extract data normally.
    `;
  }

  const prompt = `
    You are an expert executive assistant. Analyze this document.
    ${specificInstructions}

    1. CATEGORIZATION RULES:
       - "Property Repairs": For AC repair, plumbing, or structural fixes.
       - "Inventory": For seeds, nutrients, or wholesale goods.
       - "Utilities": For electric, gas, or internet.
       - "Administrative": For general documents, permits, or notices.
       - "Legal": For contracts, agreements, or legal documents.
       - "Rent": For lease or property payments.
       - "Payroll": For employee wages or benefits.
       - NEVER prefix the category with "Mary" or "Mary's". Return only the clean category.

    2. PRICE/AMOUNT RULES:
       - If a total amount is visible, extract it as a number.
       - If NO PRICE is found (e.g., it is a contract, permit, or photo), return 0.
       - In the "summary" field, if the price is 0, explain why (e.g., "Non-financial permit for site access").
    
    Return ONLY raw JSON:
    {
      "isFinancial": boolean,
      "summary": "Short 1-sentence summary (if amount is 0, explain why)",
      "filingCategory": "String",
      "confidence": number (0.0 to 1.0),
      "data": {
        "vendorName": "String (or 'N/A')",
        "amount": Number (0 if not financial),
        "date": "YYYY-MM-DD",
        "description": "String"
      }
    }
  `;

  try {
    // Send both the prompt AND the file directly to Gemini Vision
    const imagePart = fileToGenerativePart(fileBuffer, mimeType);
    const result = await visionModel.generateContent([prompt, imagePart]);

    const response = result.response.text();
    const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("AI Analysis Failed", e);
    return {
      isFinancial: false,
      summary: "Analysis Failed",
      filingCategory: "Uncategorized",
      confidence: 0,
      data: { vendorName: "", amount: 0, date: "", description: "" }
    };
  }
}

/**
 * Extract detailed invoice data using Gemini Vision
 */
export async function extractInvoiceData(
  fileBuffer: Buffer,
  mimeType: string
): Promise<ExtractedInvoice> {
  const prompt = `
    Analyze this invoice document and extract the following JSON data.
    
    Rules for 'taxClass':
    - If the vendor sells cultivation supplies, seeds, nutrients, packaging, or direct production equipment, set taxClass to "COGS - Deductible".
    - If the vendor is for rent, office supplies, marketing, legal, or utilities, set taxClass to "OpEx - Non-Deductible".
    
    Rules for 'suggestedCategory':
    - Choose one of: Utilities, Office Supplies, Supplies, Insurance, Rent, Professional Services, Marketing, Security, Miscellaneous
    
    Return ONLY raw JSON with this structure:
    {
      "vendorName": "string",
      "invoiceNumber": "string",
      "invoiceDate": "YYYY-MM-DD",
      "dueDate": "YYYY-MM-DD",
      "totalAmount": number,
      "lineItems": [{ "description": "string", "quantity": number, "unitPrice": number, "amount": number }],
      "suggestedCategory": "string",
      "taxClass": "string"
    }
  `;

  try {
    const imagePart = fileToGenerativePart(fileBuffer, mimeType);
    const result = await visionModel.generateContent([prompt, imagePart]);

    const response = result.response.text();
    const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as ExtractedInvoice;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw new Error("Failed to extract data from invoice");
  }
}

// Legacy text extraction - kept as fallback but no longer primary
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import('pdf-parse');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (pdfModule as any).default || pdfModule;
    if (typeof pdfParse === 'function') {
      const data = await pdfParse(buffer);
      return data.text;
    }
    return "";
  } catch (error) {
    console.error("⚠️ PDF Text Extraction Failed (using vision instead):", error);
    return "";
  }
}
