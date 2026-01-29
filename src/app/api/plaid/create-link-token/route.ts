import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { plaidClient, ALLOWED_PRODUCTS, SUPPORTED_COUNTRIES } from '@/lib/plaid/client';

/**
 * POST /api/plaid/create-link-token
 *
 * Creates a Plaid Link token for initializing the bank connection flow.
 * Requires authenticated user session.
 */
export async function POST() {
  try {
    // Validate user session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      );
    }

    // Create Plaid Link token
    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: user.id,
      },
      client_name: 'Mary Financial Center',
      products: ALLOWED_PRODUCTS,
      country_codes: SUPPORTED_COUNTRIES,
      language: 'en',
    });

    return NextResponse.json({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    });
  } catch (error) {
    console.error('[Plaid] Error creating link token:', error);

    // Handle Plaid-specific errors
    if (error && typeof error === 'object' && 'response' in error) {
      const plaidError = error as { response?: { data?: { error_message?: string } } };
      return NextResponse.json(
        { error: plaidError.response?.data?.error_message || 'Failed to create link token' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    );
  }
}
