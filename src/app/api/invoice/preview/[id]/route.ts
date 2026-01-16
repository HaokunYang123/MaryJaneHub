import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the document from Supabase
    const { data: doc, error } = await supabase
      .from('documents')
      .select('metadata')
      .eq('id', id)
      .single();

    if (error || !doc) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const metadata = doc.metadata as { pdfBuffer?: string; type?: string };

    if (!metadata?.pdfBuffer || metadata?.type !== 'generated_invoice') {
      return NextResponse.json({ error: 'No PDF available' }, { status: 404 });
    }

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(metadata.pdfBuffer, 'base64');

    // Return the PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="invoice.pdf"',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Invoice preview error:', error);
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}
