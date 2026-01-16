import { NextRequest, NextResponse } from 'next/server';
import { createBill, getBills, isAuthenticated } from '@/lib/quickbooks';
import { moveFileToFolder } from '@/lib/google-drive';

export async function GET() {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        console.log('[quickbooks/bills] Fetching bills');
        const bills = await getBills();
        return NextResponse.json({ bills });
    } catch (error) {
        console.error('Error fetching bills:', error);
        return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const data = await request.json();
        console.log('[quickbooks/bills] Incoming payload', data);

        // Validate required fields
        if (!data.vendorName || !data.dueDate || !data.lineItems || data.lineItems.length === 0) {
            return NextResponse.json({
                error: 'Missing required fields: vendorName, dueDate, lineItems'
            }, { status: 400 });
        }

        const taxClassMap: Record<string, { value: string; name: string }> = {
            'COGS - Deductible': { value: '100', name: 'COGS - Deductible' },
            'OpEx - Non-Deductible': { value: '200', name: 'OpEx - Non-Deductible' },
        };

        const mappedClassRef = data.taxClass ? taxClassMap[data.taxClass] : undefined;
        const classRef = data.classRef || data.ClassRef || mappedClassRef;

        console.log('[quickbooks/bills] Tax class mapping', {
            taxClass: data.taxClass,
            classRef,
        });

        const bill = await createBill({
            vendorName: data.vendorName,
            dueDate: data.dueDate,
            lineItems: data.lineItems,
            invoiceNumber: data.invoiceNumber,
            classRef,
        });

        console.log('[quickbooks/bills] Bill created', bill?.Id);

        // Move file from "Unprocessed Files" to organized folder in Google Drive
        if (data.driveId) {
            try {
                // Sanitize vendor name for folder path
                const vendorFolder = (data.vendorName || 'Unknown')
                    .replace(/[/\\?%*:|"<>]/g, '-')
                    .trim();

                // Determine category folder (default to "Invoices" if not provided)
                const categoryFolder = data.category || 'Invoices';

                // Build folder path: All Files/Invoices/{Category}/{Vendor}
                const folderPath = `All Files/Invoices/${categoryFolder}/${vendorFolder}`;

                console.log(`📁 Moving file ${data.driveId} to ${folderPath}`);
                await moveFileToFolder(data.driveId, folderPath);
                console.log(`✅ File moved to ${folderPath}`);
            } catch (moveError) {
                // Log but don't fail the request if move fails
                console.error('⚠️ Failed to move file to folder:', moveError);
            }
        }

        return NextResponse.json({
            success: true,
            bill,
            message: `Bill created for ${data.vendorName}`
        });
    } catch (error) {
        console.error('Error creating bill:', error);
        return NextResponse.json({ error: 'Failed to create bill' }, { status: 500 });
    }
}
