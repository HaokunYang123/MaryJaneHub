// src/lib/invoice-extractor.ts
import { visionModel } from '@/lib/gemini';

export interface InvoiceData {
  vendorName: string;
  amount: number;
  date: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  items: Array<{ description: string; amount: number }>;
  taxClass: "COGS - Deductible" | "OpEx - Non-Deductible";
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

// Helper to parse PDF buffer
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text;
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
