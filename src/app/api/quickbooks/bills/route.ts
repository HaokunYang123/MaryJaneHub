import { NextRequest, NextResponse } from 'next/server';
import { createBill, getBills, isAuthenticated } from '@/lib/quickbooks';

export async function GET() {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const bills = await getBills();
        return NextResponse.json({ bills });
    } catch (error) {
        console.error('Error fetching bills:', error);
        return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const data = await request.json();

        // Validate required fields
        if (!data.vendorName || !data.dueDate || !data.lineItems || data.lineItems.length === 0) {
            return NextResponse.json({
                error: 'Missing required fields: vendorName, dueDate, lineItems'
            }, { status: 400 });
        }

        const bill = await createBill({
            vendorName: data.vendorName,
            dueDate: data.dueDate,
            lineItems: data.lineItems,
            invoiceNumber: data.invoiceNumber,
        });

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
