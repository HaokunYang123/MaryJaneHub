import { NextRequest, NextResponse } from 'next/server';
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
  scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/files/cleanup
 * 1. Removes orphaned document records from Supabase (files deleted from Drive)
 * 2. Auto-deletes rejected files older than 7 days (from both Drive and Supabase)
 */
export async function POST(req: NextRequest) {
  try {
    const results = {
      orphanedRemoved: 0,
      rejectedExpired: 0,
      checked: 0,
      errors: [] as string[],
    };

    // ===== PART 1: Remove orphaned records (Drive file deleted) =====
    const { data: documents, error: fetchError } = await supabase
      .from('documents')
      .select('id, drive_id, status, rejected_at, metadata');

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ message: 'No documents to check', ...results });
    }

    results.checked = documents.length;
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
        // File doesn't exist in Drive - mark as orphaned
        const error = driveError as { code?: number };
        if (error.code === 404) {
          orphanedIds.push(doc.id);
        }
      }
    }

    // Delete orphaned records from Supabase
    if (orphanedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .in('id', orphanedIds);

      if (deleteError) {
        results.errors.push(`Orphan cleanup error: ${deleteError.message}`);
      } else {
        results.orphanedRemoved = orphanedIds.length;
      }
    }

    // ===== PART 2: Auto-delete rejected files older than 7 days =====
    const now = Date.now();
    const expiredRejected = documents.filter(doc => {
      if (doc.status !== 'rejected') return false;
      // Use rejected_at if available, fall back to checking metadata
      const rejectedAt = doc.rejected_at || doc.metadata?.processed_at;
      if (!rejectedAt) return false;
      const rejectedTime = new Date(rejectedAt).getTime();
      return (now - rejectedTime) > SEVEN_DAYS_MS;
    });

    for (const doc of expiredRejected) {
      try {
        // Delete from Drive first
        if (doc.drive_id) {
          try {
            await drive.files.delete({
              fileId: doc.drive_id,
              supportsAllDrives: true,
            });
          } catch (driveErr: unknown) {
            const err = driveErr as { code?: number };
            // Ignore 404 (already deleted)
            if (err.code !== 404) {
              console.error(`Failed to delete Drive file ${doc.drive_id}:`, driveErr);
            }
          }
        }

        // Delete from Supabase
        const { error: delError } = await supabase
          .from('documents')
          .delete()
          .eq('id', doc.id);

        if (delError) {
          results.errors.push(`Failed to delete doc ${doc.id}: ${delError.message}`);
        } else {
          results.rejectedExpired++;
        }
      } catch (err) {
        results.errors.push(`Error processing ${doc.id}: ${err}`);
      }
    }

    return NextResponse.json({
      message: 'Cleanup complete',
      ...results,
    });

  } catch (error) {
    console.error('Cleanup Error:', error);
    const message = error instanceof Error ? error.message : 'Cleanup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/files/cleanup?id=xxx
 * Manually delete a specific document record
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('id');

    if (!docId) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', docId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedId: docId });

  } catch (error) {
    console.error('Delete Error:', error);
    const message = error instanceof Error ? error.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
