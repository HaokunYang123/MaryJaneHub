import { createClient } from '@/lib/supabase/server';
import { BankAccountsClient } from './BankAccountsClient';

// Type for bank account with connection info (Supabase returns joins as arrays)
interface BankAccountRow {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  balance_current: number | null;
  balance_available: number | null;
  connection: {
    institution_name: string;
    realm_id: string;
  }[] | null;
}

// Type for company/entity
interface Company {
  realm_id: string;
  name: string | null;
}

export default async function BankAccountsPage() {
  const supabase = await createClient();

  // Fetch bank accounts with connection info
  const { data: accounts, error: accountsError } = await supabase
    .from('bank_accounts')
    .select(`
      id,
      name,
      type,
      subtype,
      mask,
      balance_current,
      balance_available,
      connection:bank_connections (
        institution_name,
        realm_id
      )
    `)
    .order('balance_current', { ascending: false });

  // Fetch companies for realm selection
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('realm_id, name');

  if (accountsError) {
    console.error('[BankAccounts] Error fetching accounts:', accountsError);
  }
  if (companiesError) {
    console.error('[BankAccounts] Error fetching companies:', companiesError);
  }

  // Transform data for client component
  const formattedAccounts = (accounts || []).map((acc: BankAccountRow) => {
    // Supabase returns joined relations as arrays
    const conn = acc.connection?.[0] || null;
    return {
      id: acc.id,
      bank: conn?.institution_name || 'Unknown Bank',
      name: acc.name,
      accountNum: acc.mask ? `****${acc.mask}` : '****',
      balance: acc.balance_current || 0,
      type: acc.subtype
        ? acc.subtype.charAt(0).toUpperCase() + acc.subtype.slice(1)
        : acc.type.charAt(0).toUpperCase() + acc.type.slice(1),
      entity: conn?.realm_id || 'Unknown',
    };
  });

  // Get available realms for linking new accounts
  const availableRealms = (companies || []).map((c: Company) => ({
    realmId: c.realm_id,
    name: c.name || c.realm_id,
  }));

  return (
    <BankAccountsClient
      accounts={formattedAccounts}
      availableRealms={availableRealms}
    />
  );
}
