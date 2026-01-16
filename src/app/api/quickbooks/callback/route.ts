import { NextRequest, NextResponse } from 'next/server';
import { exchangeToken } from '@/lib/quickbooks';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    // Handle OAuth callback from QuickBooks
    if (searchParams.has('code')) {
        const result = await exchangeToken(request.url);
        if (result.success) {
            // Redirect to dashboard with success indicator
            return NextResponse.redirect(new URL('/?qb=connected', request.url));
        }
        return NextResponse.redirect(new URL('/?qb=error', request.url));
    }

    // If no code, redirect to home
    return NextResponse.redirect(new URL('/', request.url));
}
