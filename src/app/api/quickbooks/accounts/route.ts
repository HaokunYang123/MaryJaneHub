import { NextResponse } from 'next/server';
import { getExpenseAccounts, isAuthenticated } from '@/lib/quickbooks';

export async function GET() {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const accounts = await getExpenseAccounts();
        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('Error fetching accounts:', error);
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }
}
