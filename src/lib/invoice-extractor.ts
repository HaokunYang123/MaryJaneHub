import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

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
}

export async function extractInvoiceData(text: string): Promise<ExtractedInvoice> {
    const prompt = `You are an invoice data extraction expert. Extract the following information from this invoice text and return it as JSON:

1. vendorName: The company/person issuing the invoice
2. invoiceNumber: The invoice number/reference
3. invoiceDate: The date the invoice was issued (YYYY-MM-DD format)
4. dueDate: The payment due date (YYYY-MM-DD format)
5. totalAmount: The total amount due (number only, no currency symbol)
6. lineItems: Array of items with description, quantity, unitPrice, and amount
7. suggestedCategory: Best expense category (one of: Utilities, Office Supplies, Supplies, Insurance, Rent, Professional Services, Marketing, Security, Miscellaneous)

Invoice Text:
${text}

Return ONLY valid JSON, no markdown or extra text.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0,
    });

    const content = response.choices[0].message.content;
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
