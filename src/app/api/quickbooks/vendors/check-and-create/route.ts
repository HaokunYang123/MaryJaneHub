import { NextRequest, NextResponse } from 'next/server';
import { createVendorWithDetails, isAuthenticated, queryVendorByDisplayName } from '@/lib/quickbooks';

export async function POST(request: NextRequest) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const data = await request.json();
        console.log('[quickbooks/vendors/check-and-create] Payload received', data);

        if (!data.vendorName) {
            return NextResponse.json({ error: 'vendorName is required' }, { status: 400 });
        }

        console.log('[quickbooks/vendors/check-and-create] Checking vendor', data.vendorName);
        const existingVendor = await queryVendorByDisplayName(data.vendorName);

        if (existingVendor) {
            console.log('[quickbooks/vendors/check-and-create] Vendor found', existingVendor.Id);
            return NextResponse.json({
                success: true,
                id: existingVendor.Id,
                vendor: existingVendor,
                created: false,
            });
        }

        console.log('[quickbooks/vendors/check-and-create] Vendor not found, creating');
        const createdVendor = await createVendorWithDetails(
            data.vendorName,
            data.address,
            data.phone
        );

        console.log('[quickbooks/vendors/check-and-create] Vendor created', createdVendor?.Id);
        return NextResponse.json({
            success: true,
            id: createdVendor.Id,
            vendor: createdVendor,
            created: true,
        });
    } catch (error) {
        console.error('Error checking/creating vendor:', error);
        return NextResponse.json({ error: 'Failed to check or create vendor' }, { status: 500 });
    }
}
