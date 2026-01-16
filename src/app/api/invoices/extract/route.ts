import { NextRequest, NextResponse } from 'next/server';
import { extractInvoiceData } from '@/lib/invoice-extractor';
import { suggestCategory } from '@/lib/quickbooks';
import { uploadFileToDrive } from '@/lib/google-drive';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const text = formData.get('text') as string | null;

        let extractedData;
        let invoiceText = "";
        let driveId: string | null = null;

        if (file) {
            // 1. Upload to Google Drive "Unprocessed Files" folder
            console.log(`📥 Uploading ${file.name} to Google Drive...`);
            try {
                driveId = await uploadFileToDrive(file, "Unprocessed Files");
                console.log(`✅ Uploaded to Drive: ${driveId}`);
            } catch (driveError) {
                console.error('⚠️ Drive upload failed, continuing with extraction:', driveError);
                // Continue with extraction even if Drive upload fails
            }

            // 2. Extract invoice data using Vision Model
            const buffer = Buffer.from(await file.arrayBuffer());
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
            driveId, // Include the Drive file ID for later use
            rawText: invoiceText
        });
    } catch (error) {
        console.error('Error extracting invoice:', error);
        return NextResponse.json({ error: 'Failed to extract invoice data' }, { status: 500 });
    }
}
