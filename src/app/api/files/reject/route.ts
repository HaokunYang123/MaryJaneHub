import { NextRequest, NextResponse } from 'next/server';
import { rejectDocument } from '@/lib/ai/secretary';

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }
    
    const result = await rejectDocument(documentId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Reject Error:', error);
    const message = error instanceof Error ? error.message : 'Rejection failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
