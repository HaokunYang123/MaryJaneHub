import { NextResponse } from 'next/server';
import { getPendingDocuments } from '@/lib/ai/secretary';

export async function GET() {
  try {
    const documents = await getPendingDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Fetch Pending Error:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch documents';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
