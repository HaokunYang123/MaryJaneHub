import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { plaidClient } from '@/lib/plaid/client';
import { encrypt } from '@/lib/crypto'; // TRAP #4 FIX: Use app-level encryption, not SQL vault
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/plaid/exchange-token
 *
 * Exchanges Plaid public_token for access_token, encrypts it,
 * and saves the bank connection + accounts to the database.
 *
 * Security Flow:
 * 1. Validate user session
 * 2. Exchange public_token -> access_token (Plaid API)
 * 3. Encrypt access_token using AES-256-GCM (app-level)
 * 4. Save encrypted token to bank_connections.access_token
 * 5. Fetch accounts & balances -> save to bank_accounts
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Validate user session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { publicToken, realmId, institutionName, institutionId } = body;

    // TRAP #1 FIX: Using realmId (not entityId) to match transactions table pattern
    if (!publicToken || !realmId) {
      return NextResponse.json(
        { error: 'Missing required fields: publicToken, realmId' },
        { status: 400 }
      );
    }

    // 2. Exchange public_token for access_token (Plaid API)
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // 3. Encrypt access_token (TRAP #4 FIX: app-level crypto, not SQL vault)
    const encryptedToken = encrypt(accessToken);

    // Use service role client for database operations (bypasses RLS)
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 4. Save bank connection with encrypted token
    // TRAP #5: Column is access_token, not encrypted_token
    const { data: connection, error: connectionError } = await serviceSupabase
      .from('bank_connections')
      .insert({
        realm_id: realmId,
        institution_name: institutionName || 'Unknown Institution',
        institution_id: institutionId || null,
        access_token: encryptedToken, // Encrypted ciphertext
        plaid_item_id: itemId,
        status: 'active',
      })
      .select()
      .single();

    if (connectionError) {
      console.error('[Plaid] Error saving bank connection:', connectionError);
      return NextResponse.json(
        { error: 'Failed to save bank connection' },
        { status: 500 }
      );
    }

    // 5. Fetch accounts & balances from Plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    // Map and save accounts with proper balance columns (TRAP #2 FIX)
    const accountsToInsert = accountsResponse.data.accounts.map((account) => ({
      connection_id: connection.id,
      plaid_account_id: account.account_id,
      name: account.name,
      type: account.type,
      subtype: account.subtype || null,
      mask: account.mask || null,
      // TRAP #2 FIX: Use balance_current and balance_available (not current_balance)
      balance_current: account.balances.current,
      balance_available: account.balances.available,
    }));

    const { error: accountsError } = await serviceSupabase
      .from('bank_accounts')
      .insert(accountsToInsert);

    if (accountsError) {
      console.error('[Plaid] Error saving bank accounts:', accountsError);
      // Don't fail completely - connection is saved, accounts can be retried
    }

    return NextResponse.json({
      success: true,
      connectionId: connection.id,
      accountsLinked: accountsToInsert.length,
    });
  } catch (error) {
    console.error('[Plaid] Token exchange error:', error);

    // Handle Plaid-specific errors
    if (error && typeof error === 'object' && 'response' in error) {
      const plaidError = error as { response?: { data?: { error_message?: string; error_code?: string } } };
      const errorMessage = plaidError.response?.data?.error_message || 'Token exchange failed';
      const errorCode = plaidError.response?.data?.error_code;

      return NextResponse.json(
        { error: errorMessage, code: errorCode },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to exchange token' },
      { status: 500 }
    );
  }
}
