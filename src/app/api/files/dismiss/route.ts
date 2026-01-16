import { NextRequest, NextResponse } from 'next/server';
import { dismissDocument } from '@/lib/ai/secretary';
import { supabase } from '@/lib/supabase';
import { google } from 'googleapis';

// Initialize Google Drive API
const getCredentials = () => {
  try {
    const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!jsonKey) return {};
    const credentials = JSON.parse(jsonKey);
    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }
    return credentials;
  } catch {
    return {};
  }
};

const auth = new google.auth.GoogleAuth({
  credentials: getCredentials(),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });

/**
 * POST /api/files/dismiss
 * Dismiss a single document (delete from Supabase)
 */
export async function POST(req: NextRequest) {
  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    const result = await dismissDocument(documentId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Dismiss Error:', error);
    const message = error instanceof Error ? error.message : 'Dismiss failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/files/dismiss
 * Clean up all orphaned documents (where Drive file no longer exists)
 */
export async function DELETE() {
  try {
    // Get all pending documents
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, drive_id')
      .eq('status', 'needs_review');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ message: 'No pending documents', removed: 0 });
    }

    const orphanedIds: string[] = [];

    // Check each document's Drive file exists
    for (const doc of documents) {
      if (!doc.drive_id) {
        orphanedIds.push(doc.id);
        continue;
      }

      try {
        await drive.files.get({
          fileId: doc.drive_id,
          fields: 'id',
          supportsAllDrives: true,
        });
        // File exists, keep the record
      } catch (driveError: unknown) {
        const error = driveError as { code?: number };
        if (error.code === 404) {
          orphanedIds.push(doc.id);
        }
      }
    }

    // Delete orphaned records
    if (orphanedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .in('id', orphanedIds);

      if (deleteError) {
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      message: 'Cleanup complete',
      checked: documents.length,
      removed: orphanedIds.length,
    });

  } catch (error) {
    console.error('Cleanup Error:', error);
    const message = error instanceof Error ? error.message : 'Cleanup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
