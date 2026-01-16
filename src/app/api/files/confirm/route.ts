import { NextRequest, NextResponse } from 'next/server';
import { confirmAndExecute } from '@/lib/ai/secretary';

export async function POST(req: NextRequest) {
  try {
    const { documentId, destination } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Pass destination to confirmAndExecute (defaults to 'quickbooks')
    const result = await confirmAndExecute(documentId, destination || 'quickbooks');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Confirm Error:', error);
    const message = error instanceof Error ? error.message : 'Confirmation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
