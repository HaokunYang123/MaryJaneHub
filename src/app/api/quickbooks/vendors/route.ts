import { NextRequest, NextResponse } from 'next/server';
import { getVendors, createVendor, findOrCreateVendor, isAuthenticated } from '@/lib/quickbooks';

export async function GET() {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const vendors = await getVendors();
        return NextResponse.json({ vendors });
    } catch (error) {
        console.error('Error fetching vendors:', error);
        return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const data = await request.json();

        if (!data.name) {
            return NextResponse.json({ error: 'Vendor name is required' }, { status: 400 });
        }

        // Use findOrCreate to avoid duplicates
        const vendor = data.findOrCreate
            ? await findOrCreateVendor(data.name)
            : await createVendor(data.name);

        return NextResponse.json({
            success: true,
            vendor,
            message: `Vendor "${data.name}" ready`
        });
    } catch (error) {
        console.error('Error creating vendor:', error);
        return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
    }
}
