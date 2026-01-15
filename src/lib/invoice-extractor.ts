import { visionModel } from '@/lib/gemini';

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

// --- FIX: Robust PDF Parser Import ---
// This function safely handles the import whether it comes as .default or not
const getPdfParser = async () => {
  try {
    const pdfModule = await import('pdf-parse');
    
    // Scenario 1: It's under .default (Common in Next.js)
    if (pdfModule.default && typeof pdfModule.default === 'function') {
      return pdfModule.default;
    }
    // Scenario 2: It IS the module (Common in Node)
    if (typeof pdfModule === 'function') {
      return pdfModule;
    }
    
    // Scenario 3: Fallback to require (Last resort)
    const required = require('pdf-parse');
    if (typeof required === 'function') {
      return required;
    }
    
    // If all else fails, throw a clear error
    throw new Error(`pdf-parse is not a function. Type: ${typeof pdfModule}`);
  } catch (error) {
    console.error("❌ PDF Parser Import Failed:", error);
    throw error;
  }
};

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // USE THE HELPER HERE
    const pdfParse = await getPdfParser();
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error("⚠️ PDF Text Extraction Failed:", error);
    // Return empty string so the app DOES NOT CRASH. 
    // The AI will just try to analyze the filename instead.
    return ""; 
  }
}

// --- End of Fix ---

/**
 * Smart AI Analysis
 */
export async function analyzeAndCategorize(text: string, source: 'web' | 'drive'): Promise<AIAnalysisResult> {
  
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
    You are an expert executive assistant. Analyze this document text.
    ${specificInstructions}

    1. CATEGORIZE for filing: ["Property Repairs", "Inventory", "Legal", "Utilities", "Rent", "Payroll", "Administrative", "Uncategorized"]
    
    Return ONLY raw JSON:
    {
      "isFinancial": boolean,
      "summary": "Short 1-sentence summary",
      "filingCategory": "String",
      "confidence": number (0.0 to 1.0),
      "data": {
        "vendorName": "String (or 'N/A')",
        "amount": Number (0 if not financial),
        "date": "YYYY-MM-DD",
        "description": "String"
      }
    }

    Document Text:
    ${text.substring(0, 5000)}
  `;

  try {
    const result = await visionModel.generateContent(prompt);
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

export async function extractInvoiceData(text: string): Promise<ExtractedInvoice> {
  const prompt = `
    Analyze this invoice text and extract the following JSON data.
    
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

    Invoice Text:
    ${text.substring(0, 3000)}
  `;

  try {
    const result = await visionModel.generateContent(prompt);
    const response = result.response.text();
    const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as ExtractedInvoice;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw new Error("Failed to extract data from invoice");
  }
}
