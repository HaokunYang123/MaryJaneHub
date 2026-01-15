import { NextRequest, NextResponse } from 'next/server';
import { analyzeUploadedFile } from '@/lib/ai/secretary';
import { uploadFileToDrive } from '@/lib/google-drive';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(`📥 Receiving file: ${file.name}`);

    // 1. Upload to Google Drive
    // This puts it in a folder named "Inbox"
    const driveId = await uploadFileToDrive(file, "Inbox");

    if (!driveId) {
      throw new Error("Drive upload failed");
    }

    // 2. Extract text for AI analysis
    let textContext = `File Name: ${file.name}`;
    
    if (file.type === 'application/pdf') {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(buffer);
        textContext = pdfData.text || textContext;
      } catch (pdfError) {
        console.log('PDF parse failed, using filename:', pdfError);
      }
    } else if (!file.type.startsWith('image/')) {
      // For text files, read content
      try {
        textContext = await file.text();
      } catch {
        // Keep filename as context
      }
    }

    // 3. Trigger AI Analysis
    // 'web' means we assume it's financial because it came from the dashboard
    const result = await analyzeUploadedFile(driveId, textContext, 'web');

    return NextResponse.json(result);

  } catch (error) {
    console.error("API Error:", error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
