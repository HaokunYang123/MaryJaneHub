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

    console.log(`📥 Receiving file: ${file.name} (${file.type})`);

    // 1. Upload to Google Drive "Unprocessed Files" folder
    const driveId = await uploadFileToDrive(file, "Unprocessed Files");

    if (!driveId) {
      throw new Error("Drive upload failed");
    }

    // 2. Get file buffer for Gemini Vision analysis
    const buffer = Buffer.from(await file.arrayBuffer());

    // 3. Trigger AI Analysis with Gemini Vision
    // Sends the raw file directly to Gemini - works on scanned PDFs!
    // Pass original file name for duplicate detection
    const result = await analyzeUploadedFile(driveId, buffer, file.type, 'web', file.name);

    return NextResponse.json(result);

  } catch (error) {
    console.error("API Error:", error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
