import { supabase } from './supabase';
import { getBills, getTokens } from './quickbooks';

export async function syncQuickBooksData(realmId: string) {
  // Ensure we are auth'd for this realm
  const tokens = getTokens();
  if (!tokens || tokens.realmId !== realmId) {
    throw new Error(`Not authenticated for realm ${realmId}`);
  }

  // 1. Fetch Bills (Expenses) from QB
  const bills = await getBills();

  // 2. Transform for Supabase
  const transactions = bills.map((bill: any) => ({
    realm_id: realmId,
    date: bill.TxnDate,
    amount: bill.TotalAmt,
    vendor: bill.VendorRef?.name || 'Unknown',
    category: 'Expense', // Simplify for now
    source: 'quickbooks',
    external_id: bill.Id,
    is_reconciled: true, // It's in QB, so it's "on the books"
  }));

  // 3. Upsert to Supabase
  const { error } = await supabase
    .from('transactions')
    .upsert(transactions, { onConflict: 'source,external_id' });

  if (error) {
    console.error('Error syncing QB transactions:', error);
    throw error;
  }

  return transactions.length;
}

export async function detectGhostTransactions(realmId: string) {
  // Logic: Find Plaid transactions that have NO matching QB transaction (fuzzy match)
  // This is a simplified "SQL-like" logic. Real fuzzy matching is better done in code or specialized SQL functions.
  
  // 1. Get all Plaid (Bank) transactions for this realm
  const { data: bankTxns } = await supabase
    .from('transactions')
    .select('*')
    .eq('realm_id', realmId)
    .eq('source', 'plaid');

  // 2. Get all QB (Book) transactions
  const { data: bookTxns } = await supabase
    .from('transactions')
    .select('*')
    .eq('realm_id', realmId)
    .eq('source', 'quickbooks');

  if (!bankTxns || !bookTxns) return [];

  // 3. Find Ghosts (items in Bank but not in Book)
  const ghosts = bankTxns.filter(bankItem => {
    // Check if any book item matches (Date +/- 3 days, Amount matches)
    const match = bookTxns.find(bookItem => {
      const amtMatch = Math.abs(bookItem.amount - bankItem.amount) < 0.01;
      
      const d1 = new Date(bankItem.date);
      const d2 = new Date(bookItem.date);
      const dayDiff = Math.abs((d1.getTime() - d2.getTime()) / (1000 * 3600 * 24));
      
      return amtMatch && dayDiff <= 3;
    });
    return !match; // If no match, it's a ghost
  });

  return ghosts;
}
