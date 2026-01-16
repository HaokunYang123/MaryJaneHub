import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { supabase } from '@/lib/supabase';
import { runTier1, runTier2 } from '@/lib/invoice-extractor';

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

// Helper to get Drive link
function getDriveLink(driveId: string): string {
  return `https://drive.google.com/file/d/${driveId}/view`;
}

/**
 * POST /api/sync/drive
 * Sync all files from Google Drive to Supabase
 * Analyzes files that haven't been processed yet
 */
export async function POST(req: NextRequest) {
  try {
    const { folderId, forceReindex } = await req.json().catch(() => ({}));

    console.log('🔄 Starting Drive sync...');

    // 1. Get all files from Drive (or specific folder)
    let query = "mimeType != 'application/vnd.google-apps.folder' and trashed = false";
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const driveFiles: Array<{ id: string; name: string; mimeType: string; createdTime: string }> = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, createdTime)',
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (response.data.files) {
        driveFiles.push(...response.data.files.map(f => ({
          id: f.id!,
          name: f.name!,
          mimeType: f.mimeType!,
          createdTime: f.createdTime!,
        })));
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    console.log(`📁 Found ${driveFiles.length} files in Drive`);

    // 2. Get existing documents from Supabase
    const { data: existingDocs } = await supabase
      .from('documents')
      .select('drive_id');

    const existingDriveIds = new Set((existingDocs || []).map(d => d.drive_id));

    // 3. Filter to only new files (unless forceReindex)
    const filesToProcess = forceReindex
      ? driveFiles
      : driveFiles.filter(f => !existingDriveIds.has(f.id));

    console.log(`📝 Processing ${filesToProcess.length} new files`);

    // 4. Process each file
    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      files: [] as Array<{ name: string; status: string; error?: string }>,
    };

    for (const file of filesToProcess) {
      try {
        // Skip non-document files
        const supportedTypes = [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/jpg',
          'text/plain',
        ];

        if (!supportedTypes.some(t => file.mimeType.includes(t.split('/')[1]))) {
          results.skipped++;
          results.files.push({ name: file.name, status: 'skipped', error: 'Unsupported file type' });
          continue;
        }

        console.log(`📄 Processing: ${file.name}`);

        // Download file content
        const fileResponse = await drive.files.get(
          { fileId: file.id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );

        const buffer = Buffer.from(fileResponse.data as ArrayBuffer);

        // Run AI analysis
        const tier1 = await runTier1(buffer, file.mimeType);
        let analysis: Record<string, unknown> = { ...tier1, needsBookkeeping: false };

        // Run Tier 2 for actionable documents
        if (tier1.needs_deep_analysis) {
          const tier2 = await runTier2(buffer, file.mimeType);
          analysis = {
            ...tier1,
            ...tier2,
            fileName: file.name,
            data: {
              vendorName: tier2.vendorName,
              amount: tier2.amount,
              date: tier2.date,
              description: tier2.description,
            },
          };
        }

        // Build category label
        const tier2Data = analysis as { category?: string; property?: string };
        const categoryLabel = tier2Data.property
          ? `${tier2Data.category} - ${tier2Data.property}`
          : tier2Data.category || tier1.subcategory || 'Other';

        // Save to Supabase
        const { error: insertError } = await supabase.from('documents').insert({
          drive_id: file.id,
          content: (analysis as { description?: string }).description || file.name,
          metadata: {
            ...analysis,
            fileName: file.name,
            driveLink: getDriveLink(file.id),
            syncedAt: new Date().toISOString(),
          },
          category: categoryLabel,
          status: tier1.needs_deep_analysis ? 'needs_review' : 'archived',
          is_duplicate: false,
        });

        if (insertError) {
          throw new Error(insertError.message);
        }

        results.processed++;
        results.files.push({ name: file.name, status: 'processed' });

      } catch (error) {
        console.error(`Error processing ${file.name}:`, error);
        results.errors++;
        results.files.push({
          name: file.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`✅ Sync complete: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors`);

    return NextResponse.json({
      success: true,
      totalInDrive: driveFiles.length,
      alreadyIndexed: existingDriveIds.size,
      ...results,
    });

  } catch (error) {
    console.error('Drive sync error:', error);
    const message = error instanceof Error ? error.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sync/drive
 * Get sync status
 */
export async function GET() {
  try {
    // Count files in Drive
    const driveResponse = await drive.files.list({
      q: "mimeType != 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id)',
      pageSize: 1000,
      supportsAllDrives: true,
    });

    const driveCount = driveResponse.data.files?.length || 0;

    // Count indexed documents
    const { count: indexedCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    // Count pending review
    const { count: pendingCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'needs_review');

    return NextResponse.json({
      driveFiles: driveCount,
      indexedDocuments: indexedCount || 0,
      pendingReview: pendingCount || 0,
      notIndexed: driveCount - (indexedCount || 0),
    });

  } catch (error) {
    console.error('Status check error:', error);
    const message = error instanceof Error ? error.message : 'Status check failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
