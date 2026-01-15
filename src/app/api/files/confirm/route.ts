import { NextRequest, NextResponse } from 'next/server';
import { confirmAndExecute } from '@/lib/ai/secretary';

export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();
    
    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }
    
    const result = await confirmAndExecute(documentId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Confirm Error:', error);
    const message = error instanceof Error ? error.message : 'Confirmation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
