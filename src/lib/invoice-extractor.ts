import { visionModel } from '@/lib/gemini';

export interface AIAnalysisResult {
  isFinancial: boolean; // <--- NEW FLAG
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

// Legacy interface for backward compatibility
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

export interface InvoiceData {
  vendorName: string;
  amount: number;
  date: string;
  dueDate: string;
  items: Array<{ description: string; amount: number }>;
  taxClass: "COGS - Deductible" | "OpEx - Non-Deductible";
}

// Helper to parse PDF buffer
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfModule = await import('pdf-parse');
  const PDFParse = (pdfModule as { PDFParse?: unknown }).PDFParse;

  if (typeof PDFParse !== 'function') {
    throw new Error('PDFParse class not found in pdf-parse module');
  }

  // pdf-parse v2+ exposes a PDFParse class
  const parser = new (PDFParse as new (opts: { data: Buffer }) => {
    getText: () => Promise<{ text: string }>;
    destroy: () => Promise<void>;
  })({ data: buffer });

  const textResult = await parser.getText();
  await parser.destroy();

  return textResult.text;
}

/**
 * Smart AI Analysis - Behaves differently based on source
 * @param text - Document text content
 * @param source - 'web' (aggressive) or 'drive' (cautious)
 */
export async function analyzeAndCategorize(text: string, source: 'web' | 'drive'): Promise<AIAnalysisResult> {
  
  // A. AGGRESSIVE MODE (For Website Uploads)
  // We assume it's a bill because Mary clicked "Upload" on the dashboard.
  let specificInstructions = `
    CONTEXT: The user explicitly uploaded this to the Accounting Dashboard. 
    Assume it is an invoice, receipt, or financial document. 
    Find the best possible match for Vendor and Amount.
  `;

  // B. CAUTIOUS MODE (For Background Drive Files)
  // We have no idea what this is. It could be a permit, a contract, or a cat photo.
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
    // Fallback for errors
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
 * Legacy function for invoice extraction (backward compatibility)
 */
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
    const response = result.response;
    let responseText = response.text();
    
    // Clean up markdown code blocks if Gemini adds them
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(responseText) as ExtractedInvoice;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw new Error("Failed to extract data from invoice");
  }
}
