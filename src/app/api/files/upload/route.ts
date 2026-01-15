import { NextRequest, NextResponse } from 'next/server';
import { analyzeUploadedFile } from '@/lib/ai/secretary';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Generate a mock Drive ID (in production, upload to Google Drive first)
    const driveId = "drive_" + Date.now() + "_" + file.name.replace(/\s/g, '_');
    
    // Extract text from file
    let text = '';
    
    if (file.type === 'application/pdf') {
      // For PDF files, use pdf-parse
      const buffer = Buffer.from(await file.arrayBuffer());
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(buffer);
        text = pdfData.text;
      } catch {
        text = `PDF Document: ${file.name}`;
      }
    } else if (file.type.startsWith('image/')) {
      // For images, we'd use OCR - for now use placeholder
      text = `Image Document: ${file.name}`;
    } else {
      // For text files
      text = await file.text();
    }

    // If no text extracted, use filename as context
    if (!text.trim()) {
      text = `Document uploaded: ${file.name}`;
    }

    // 3. Trigger Secretary Analysis
    // EXPLICITLY PASS 'web' - User clicked upload on dashboard = assume financial
    const result = await analyzeUploadedFile(driveId, text, 'web');
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload Error:', error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
