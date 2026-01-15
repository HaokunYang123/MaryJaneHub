import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl, exchangeToken, isAuthenticated } from '@/lib/quickbooks';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action');

    // Check authentication status
    if (action === 'status') {
        return NextResponse.json({ authenticated: isAuthenticated() });
    }

    // Handle OAuth callback
    if (searchParams.has('code')) {
        const result = await exchangeToken(request.url);
        if (result.success) {
            return NextResponse.redirect(new URL('/?qb=connected', request.url));
        }
        return NextResponse.redirect(new URL('/?qb=error', request.url));
    }

    // Redirect to QuickBooks OAuth
    const authUrl = getAuthUrl();
    return NextResponse.redirect(authUrl);
}
