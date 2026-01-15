import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceData, extractTextFromPDF } from '@/lib/invoice-extractor';
import { suggestCategory } from '@/lib/quickbooks';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const text = formData.get('text') as string | null;

        let invoiceText: string;

        if (file) {
            // Extract text from uploaded PDF
            const buffer = Buffer.from(await file.arrayBuffer());
            invoiceText = await extractTextFromPDF(buffer);
        } else if (text) {
            // Use provided text directly
            invoiceText = text;
        } else {
            return NextResponse.json({ error: 'No file or text provided' }, { status: 400 });
        }

        // Extract structured data using AI
        const extractedData = await extractInvoiceData(invoiceText);

        // Enhance with category suggestion
        extractedData.suggestedCategory = suggestCategory(
            extractedData.vendorName,
            extractedData.lineItems[0]?.description
        );

        return NextResponse.json({
            success: true,
            data: extractedData,
            rawText: invoiceText.substring(0, 500) + '...' // Preview only
        });
    } catch (error) {
        console.error('Error extracting invoice:', error);
        return NextResponse.json({ error: 'Failed to extract invoice data' }, { status: 500 });
    }
}
