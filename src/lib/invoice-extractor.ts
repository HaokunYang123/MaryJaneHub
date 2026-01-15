import { classifierModel, deepExtractionModel, visionModel } from '@/lib/gemini';

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

// Tier 2 Deep Extraction Result
export interface Tier2Result {
  vendorName: string;
  amount: number;
  date: string;
  description: string;
  filingCategory: string;
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
 * TIER 2: Deep Extraction with Gemini 2.5 Flash
 * Only runs on documents that need deep analysis (actionable financials)
 */
export async function runTier2(buffer: Buffer, mimeType: string): Promise<Tier2Result> {
  const prompt = `Perform DEEP EXTRACTION on this financial document.
  Extract: Vendor, Amount, Date, and Description.
  
  RULES:
  - If NO PRICE is found, set amount to 0 and explain in description.
  - NEVER prefix categories or names with "Mary" or "Mary's".
  - Use clean category names only.
  
  IMPORTANT: For 'filingCategory', you MUST use one of these exact folder names:
  ${ALLOWED_FOLDERS.join(", ")}
  
  - "Property Repairs": AC repair, plumbing, maintenance.
  - "Utilities": Electric, gas, internet, water.
  - "Inventory": Seeds, nutrients, supplies, wholesale goods.
  - "Administrative": Permits, notices, general docs.
  - "Legal": Contracts, agreements.
  - "Payroll": Wages, benefits, HR.
  - "Taxes": Tax forms, filings.
  
  Return ONLY raw JSON:
  {
    "vendorName": "string",
    "amount": number,
    "date": "YYYY-MM-DD",
    "description": "string",
    "filingCategory": "one of the exact folder names above"
  }`;

  try {
    const result = await deepExtractionModel.generateContent([prompt, fileToPart(buffer, mimeType)]);
    const response = result.response.text();
    const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Tier 2 Extraction Failed:", error);
    return {
      vendorName: "Unknown",
      amount: 0,
      date: "",
      description: "Extraction failed",
      filingCategory: "Administrative"
    };
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
    const pdfParse = pdfModule.default || pdfModule;
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
