import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, checkBillExists } from '@/lib/quickbooks';

/**
 * POST /api/quickbooks/check-invoice
 * Check if an invoice/bill already exists in QuickBooks (by vendor + amount)
 */
export async function POST(req: NextRequest) {
  try {
    const { vendorName, amount } = await req.json();

    if (!vendorName || amount === undefined) {
      return NextResponse.json({ error: 'vendorName and amount required' }, { status: 400 });
    }

    // Check if connected to QuickBooks
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return NextResponse.json({
        exists: false,
        notConnected: true,
        message: 'QuickBooks not connected. Connect to check for duplicates.'
      });
    }

    // Actually check QuickBooks for existing bill
    console.log(`[QB Check] Looking for bill: ${vendorName} - $${amount}`);
    const result = await checkBillExists(vendorName, amount);

    if (result.exists) {
      console.log(`[QB Check] Found existing bill: ${result.billId}`);
      return NextResponse.json({
        exists: true,
        billId: result.billId,
        billNumber: result.billNumber,
        vendorName: result.vendorName,
        totalAmount: result.totalAmount,
        message: `Bill already exists in QuickBooks (Bill #${result.billNumber || result.billId})`
      });
    }

    console.log(`[QB Check] No existing bill found for ${vendorName} - $${amount}`);
    return NextResponse.json({ exists: false });

  } catch (error) {
    console.error('QB check failed:', error);
    const message = error instanceof Error ? error.message : 'Check failed';
    return NextResponse.json({ exists: false, error: message });
  }
}
