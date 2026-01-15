import { GoogleGenerativeAI } from '@google/generative-ai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface ExtractedInvoice {
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
    taxClass: 'COGS - Deductible' | 'OpEx - Non-Deductible';
}

function getModel() {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('Missing GEMINI_API_KEY');
    }

    return gemini.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
        },
    });
}

export async function extractInvoiceData(text: string): Promise<ExtractedInvoice> {
    const prompt = `You are an invoice data extraction expert for cannabis accounting. Extract the following information from this invoice text and return it as JSON:

1. vendorName: The company/person issuing the invoice
2. invoiceNumber: The invoice number/reference
3. invoiceDate: The date the invoice was issued (YYYY-MM-DD format)
4. dueDate: The payment due date (YYYY-MM-DD format)
5. totalAmount: The total amount due (number only, no currency symbol)
6. lineItems: Array of items with description, quantity, unitPrice, and amount
7. suggestedCategory: Best expense category (one of: Utilities, Office Supplies, Supplies, Insurance, Rent, Professional Services, Marketing, Security, Miscellaneous)
8. taxClass: "COGS - Deductible" or "OpEx - Non-Deductible"

Classify taxClass as "COGS - Deductible" for cultivation/production inputs (e.g., nutrients, grow supplies, packaging, soil, seeds, trimming). Classify as "OpEx - Non-Deductible" for operating expenses (e.g., rent, office supplies, payroll services, marketing, professional services).

Invoice Text:
${text}

Return ONLY valid JSON, no markdown or extra text.`;

    const model = getModel();
    const response = await model.generateContent(prompt);
    const content = response.response.text();
    if (!content) {
        throw new Error('Failed to extract invoice data');
    }

    return JSON.parse(content);
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    // Dynamic import for pdf-parse (it has issues with static imports in Next.js)
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text;
}
