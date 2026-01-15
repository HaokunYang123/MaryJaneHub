import { NextRequest, NextResponse } from 'next/server';
import { getProfitAndLoss, isAuthenticated } from '@/lib/quickbooks';

export async function GET(request: NextRequest) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const searchParams = request.nextUrl.searchParams;

        // Default to current year if no dates provided
        const today = new Date();
        const startOfYear = new Date(today.getFullYear(), 0, 1);

        const startDate = searchParams.get('start_date') || startOfYear.toISOString().split('T')[0];
        const endDate = searchParams.get('end_date') || today.toISOString().split('T')[0];

        const report = await getProfitAndLoss(startDate, endDate);

        return NextResponse.json({
            report,
            period: { startDate, endDate }
        });
    } catch (error) {
        console.error('Error fetching P&L report:', error);
        return NextResponse.json({ error: 'Failed to fetch P&L report' }, { status: 500 });
    }
}
