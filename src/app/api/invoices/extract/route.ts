import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceData, extractTextFromPDF } from '@/lib/invoice-extractor';
import { suggestCategory } from '@/lib/quickbooks';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const text = formData.get('text') as string | null;

        let extractedData;
        let invoiceText = "";

        if (file) {
            const buffer = Buffer.from(await file.arrayBuffer());
            // Use Vision Model
            extractedData = await extractInvoiceData(buffer, file.type || 'application/pdf');
            invoiceText = "(Vision extraction used)";
        } else if (text) {
            return NextResponse.json({ error: 'Text-only extraction is deprecated. Please upload a file.' }, { status: 400 });
        } else {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Enhance with category suggestion
        extractedData.suggestedCategory = suggestCategory(
            extractedData.vendorName,
            extractedData.lineItems?.[0]?.description || ""
        );

        return NextResponse.json({
            success: true,
            data: extractedData,
            rawText: invoiceText
        });
    } catch (error) {
        console.error('Error extracting invoice:', error);
        return NextResponse.json({ error: 'Failed to extract invoice data' }, { status: 500 });
    }
}
