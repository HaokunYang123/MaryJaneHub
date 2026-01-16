// The "Secretary" - Business logic for Trust but Verify workflow
// Supabase-only persistence (no local fallback)

import { analyzeAndCategorize, runTier1, runTier2, AIAnalysisResult, Tier1Result, Tier2Result } from '@/lib/invoice-extractor';
import { moveFileToFolder, getFolderByStatus, checkFileExists, uploadBufferToDrive } from '@/lib/google-drive';
import { supabase } from '@/lib/supabase';
import { createBill, isAuthenticated } from '@/lib/quickbooks';

// QuickBooks sync function - calls QuickBooks API directly
async function syncBillToQuickBooks(doc: { id: string; drive_id: string }, analysis: AIAnalysisResult) {
  console.log('🔄 [QB Sync] Starting sync for document:', doc.id);
  console.log('🔄 [QB Sync] Analysis data:', JSON.stringify(analysis.data, null, 2));

  const vendorName = analysis.data?.vendorName;
  const amount = analysis.data?.amount;
  const description = analysis.data?.description || 'Invoice';
  const date = analysis.data?.date;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoiceNumber = (analysis as any).invoiceNumber || (analysis.data as any)?.invoiceNumber;

  console.log('🔄 [QB Sync] Extracted:', { vendorName, amount, description, date, invoiceNumber });

  if (!vendorName || !amount) {
    console.log('⚠️ [QB Sync] Skipping: Missing vendor or amount');
    return { success: false, reason: 'Missing vendor or amount' };
  }

  // Check if authenticated with QuickBooks
  console.log('🔄 [QB Sync] Checking QuickBooks authentication...');
  const authenticated = await isAuthenticated();
  console.log('🔄 [QB Sync] Authenticated:', authenticated);

  if (!authenticated) {
    console.log('⚠️ [QB Sync] Skipping: Not authenticated with QuickBooks');
    return { success: false, reason: 'Not authenticated with QuickBooks' };
  }

  // Calculate due date (30 days from invoice date or today)
  const invoiceDate = date ? new Date(date) : new Date();
  const dueDate = new Date(invoiceDate);
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  const billData = {
    vendorName,
    dueDate: dueDateStr,
    invoiceNumber: invoiceNumber || `INV-${doc.drive_id.slice(-6)}`,
    lineItems: [{
      description,
      amount,
      category: (analysis as unknown as Record<string, unknown>).category as string || 'Miscellaneous'
    }]
  };

  console.log('🔄 [QB Sync] Creating bill with data:', JSON.stringify(billData, null, 2));

  try {
    // Call QuickBooks createBill directly
    const bill = await createBill(billData);

    console.log(`✅ [QB Sync] Bill created successfully! ID: ${bill?.Id}`);
    return { success: true, billId: bill?.Id };
  } catch (error) {
    console.error('❌ [QB Sync] Failed:', error);
    return { success: false, reason: String(error) };
  }
}

// File interface for batch processing
interface BatchFile {
  driveId: string;
  buffer: Buffer;
  type: string;
}

/**
 * BATCH ORCHESTRATOR: Process documents in batches of 50
 * Uses tiered AI to minimize costs on 5,000+ files
 */
export async function processDocumentBatch(files: BatchFile[]) {
  console.log(`📦 Processing batch of ${files.length} files`);
  const results = [];

  for (const file of files) {
    try {
      // 1. Tier 1 runs on EVERYTHING ($0.00001 cost)
      const classification: Tier1Result = await runTier1(file.buffer, file.type);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let finalData: any = classification;
      let status = 'processed'; // Default for non-actionable

      // 2. Tier 2 (Gemini 2.5 Flash) runs ONLY on actionable items
      if (classification.needs_deep_analysis) {
        const deepData: Tier2Result = await runTier2(file.buffer, file.type);
        finalData = { ...classification, ...deepData };
        status = 'needs_review'; // Actionable items need Mary's approval
      }

      // 3. Save to Supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tier2Data = finalData as any;
      const categoryLabel = tier2Data.category
        ? (tier2Data.property ? `${tier2Data.category} - ${tier2Data.property}` : tier2Data.category)
        : classification.subcategory || 'Other';

      const { data: doc, error } = await supabase.from('documents').insert({
        drive_id: file.driveId,
        metadata: finalData,
        category: categoryLabel,
        status: status,
        is_duplicate: false,
      }).select().single();

      if (error) {
        console.error(`Failed to save ${file.driveId}:`, error.message);
      } else {
        results.push(doc);
      }

    } catch (error) {
      console.error(`Error processing ${file.driveId}:`, error);
    }
  }

  console.log(`✅ Batch complete: ${results.length}/${files.length} processed`);
  return results;
}

// Helper to generate Drive link
function getDriveLink(driveId: string): string {
  return `https://drive.google.com/file/d/${driveId}/view`;
}

// Duplicate detection result
interface DuplicateInfo {
  isDuplicate: boolean;
  duplicateId: string | null;
  duplicateDriveId: string | null;
  duplicateDriveLink: string | null;
  duplicateReason: string | null;
}

/**
 * Enhanced duplicate detection
 * Checks: file name, vendor+amount, and content similarity
 */
async function checkForDuplicates(
  fileName: string | undefined,
  vendorName: string,
  amount: number,
  description: string
): Promise<DuplicateInfo> {
  const result: DuplicateInfo = {
    isDuplicate: false,
    duplicateId: null,
    duplicateDriveId: null,
    duplicateDriveLink: null,
    duplicateReason: null
  };

  try {
    // Get recent documents (last 90 days) - exclude rejected
    const { data: recentDocs, error } = await supabase
      .from('documents')
      .select('id, drive_id, metadata, content')
      .neq('status', 'rejected')
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (error || !recentDocs) {
      console.log('Duplicate check query failed:', error?.message);
      return result;
    }

    for (const doc of recentDocs) {
      const meta = doc.metadata || {};
      const docVendor = meta.data?.vendorName || meta.vendorName || '';
      const docAmount = meta.data?.amount || meta.amount || 0;
      const docDescription = meta.data?.description || meta.description || doc.content || '';
      const docFileName = meta.fileName || '';

      let isMatch = false;
      let matchReason = '';

      // Check 1: Exact file name match
      if (fileName && docFileName && fileName.toLowerCase() === docFileName.toLowerCase()) {
        isMatch = true;
        matchReason = `Same file name: "${fileName}"`;
      }
      // Check 2: Same vendor + same amount (within $1)
      else if (
        vendorName &&
        docVendor &&
        vendorName.toLowerCase() === docVendor.toLowerCase() &&
        Math.abs(amount - docAmount) < 1
      ) {
        isMatch = true;
        matchReason = `Same vendor "${vendorName}" and amount $${amount}`;
      }
      // Check 3: Very similar description (content matching)
      else if (description && docDescription && description.length > 10 && docDescription.length > 10) {
        const similarity = calculateSimilarity(description.toLowerCase(), docDescription.toLowerCase());
        if (similarity > 0.85) {
          isMatch = true;
          matchReason = `Similar content (${Math.round(similarity * 100)}% match)`;
        }
      }

      // If we found a match, verify the Drive file still exists
      if (isMatch && doc.drive_id) {
        const fileExists = await checkFileExists(doc.drive_id);

        if (fileExists) {
          // File exists - this is a real duplicate
          result.isDuplicate = true;
          result.duplicateId = doc.id;
          result.duplicateDriveId = doc.drive_id;
          result.duplicateDriveLink = getDriveLink(doc.drive_id);
          result.duplicateReason = matchReason;
          return result;
        } else {
          // Drive file was deleted - clean up orphaned Supabase record
          console.log(`🧹 Cleaning up orphaned record ${doc.id} (Drive file deleted)`);
          await supabase.from('documents').delete().eq('id', doc.id);
          // Continue checking other documents
        }
      }
    }
  } catch (err) {
    console.log('Duplicate check failed:', err);
  }

  return result;
}

/**
 * Simple similarity calculation (Jaccard similarity on words)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * PHASE 1: ANALYZE & HOLD
 * Uses tiered AI approach:
 * - Tier 1: Quick classification to determine if deep analysis needed
 * - Tier 2: Deep extraction with needsBookkeeping, category, property fields
 */
export async function analyzeUploadedFile(
  fileId: string,
  fileBuffer: Buffer,
  mimeType: string,
  source: 'web' | 'drive' = 'web',
  fileName?: string
) {
  console.log(`🕵️‍♂️ Analyzing file: ${fileId} (Source: ${source}, Type: ${mimeType}, Name: ${fileName || 'unknown'})`);

  // 1. Run Tier 1 Classification (cheap, fast)
  const tier1: Tier1Result = await runTier1(fileBuffer, mimeType);
  console.log(`📋 Tier 1: ${tier1.category} / ${tier1.subcategory} / needs_deep: ${tier1.needs_deep_analysis}`);

  // 2. For Drive source non-actionable files, archive without deep analysis
  if (!tier1.needs_deep_analysis && source === 'drive') {
    console.log(`📂 Non-actionable file from Drive, archiving`);

    try {
      await moveFileToFolder(fileId, tier1.subcategory);
    } catch (driveError) {
      console.log('Drive move skipped:', driveError);
    }

    // Save as archived with Tier 1 data only
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        drive_id: fileId,
        metadata: { ...tier1, needsBookkeeping: false },
        category: tier1.subcategory,
        status: 'archived',
        is_duplicate: false,
        duplicate_of_id: null,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Supabase insert failed: ${error.message}`);
    }

    return {
      success: true,
      message: "Archived non-financial document",
      ...(doc ?? {}),
      status: 'archived'
    };
  }

  // 3. Run Tier 2 Deep Extraction (gets needsBookkeeping, category, property, etc.)
  const tier2: Tier2Result = await runTier2(fileBuffer, mimeType);
  console.log(`📊 Tier 2: ${tier2.category} / ${tier2.property || 'N/A'} / needsBookkeeping: ${tier2.needsBookkeeping}`);

  // Merge Tier 1 + Tier 2 data (include fileName for future duplicate checks)
  const analysis = {
    ...tier1,
    ...tier2,
    fileName: fileName || null,
    // Include legacy-compatible fields for UI
    data: {
      vendorName: tier2.vendorName,
      amount: tier2.amount,
      date: tier2.date,
      description: tier2.description,
    }
  };

  // Build category label for display
  const categoryLabel = tier2.property
    ? `${tier2.category} - ${tier2.property}`
    : tier2.category;

  // 4. Enhanced duplicate detection (checks name, vendor+amount, content similarity)
  const duplicateInfo = await checkForDuplicates(
    fileName,
    tier2.vendorName,
    tier2.amount,
    tier2.description
  );

  if (duplicateInfo.isDuplicate) {
    console.log(`⚠️ Duplicate detected: ${duplicateInfo.duplicateReason}`);
  }

  // 5. Save Document with full analysis and duplicate info
  const { data: savedDoc, error: saveError } = await supabase
    .from('documents')
    .insert({
      drive_id: fileId,
      content: tier2.description,
      metadata: {
        ...analysis,
        // Store duplicate info in metadata for UI
        duplicateInfo: duplicateInfo.isDuplicate ? {
          reason: duplicateInfo.duplicateReason,
          existingDriveLink: duplicateInfo.duplicateDriveLink,
          existingDriveId: duplicateInfo.duplicateDriveId,
        } : null
      },
      category: categoryLabel,
      status: 'needs_review',
      is_duplicate: duplicateInfo.isDuplicate,
      duplicate_of_id: duplicateInfo.duplicateId,
    })
    .select()
    .single();

  if (saveError) {
    throw new Error(`Supabase insert failed: ${saveError.message}`);
  }

  console.log(`✅ Document saved: ${savedDoc?.id}, needsBookkeeping: ${tier2.needsBookkeeping}, isDuplicate: ${duplicateInfo.isDuplicate}`);
  return savedDoc;
}

/**
 * PHASE 2: EXECUTE
 * Triggered ONLY when Mary clicks "Confirm"
 * @param documentId - The document ID to process
 * @param destination - Where to send: 'quickbooks' | 'drive_only' | 'archive'
 */
export async function confirmAndExecute(documentId: string, destination: string = 'quickbooks') {
  console.log(`🚀 Confirming document: ${documentId} → Destination: ${destination}`);

  // Get document
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchError || !doc) {
    throw new Error(fetchError?.message || "Document not found");
  }

  if (doc.status === 'processed') {
    throw new Error("Document already processed");
  }

  const analysis = doc.metadata as AIAnalysisResult;

  try {
    // Cast metadata to access Tier 2 fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = analysis as any;

    // New simplified fields
    const category = meta.category || "Other";
    const property = meta.property; // Any property name/location (dynamic)
    const expenseType = meta.expenseType; // Repairs, Utilities, Management, Tenant Invoice, etc.

    // Sanitize folder names (remove special characters that could cause issues)
    const sanitizeFolderName = (name: string) => {
      if (!name || typeof name !== 'string') return null;
      // Remove leading/trailing whitespace and replace problematic characters
      const sanitized = name.trim().replace(/[<>:"/\\|?*]/g, '-');
      return sanitized.length > 0 ? sanitized : null;
    };

    // Build simple folder path (max 3 levels)
    // Examples:
    //   All Files/Dispensary/Inventory
    //   All Files/Properties/Phoenix/Repairs
    //   All Files/Properties/Tucson/Tenant Invoice
    //   All Files/Payroll
    //   All Files/Legal
    const buildPath = () => {
      const safeCategory = sanitizeFolderName(category) || "Other";
      let path = `All Files/${safeCategory}`;

      // Properties get location subfolder
      if (safeCategory === "Properties") {
        const safeProperty = sanitizeFolderName(property);
        if (safeProperty) {
          path += `/${safeProperty}`;
          // Add expense type if available
          const safeExpenseType = sanitizeFolderName(expenseType);
          if (safeExpenseType) {
            path += `/${safeExpenseType}`;
          }
        }
      }
      // Dispensary gets expense type subfolder
      else if (safeCategory === "Dispensary") {
        const safeExpenseType = sanitizeFolderName(expenseType);
        if (safeExpenseType) {
          path += `/${safeExpenseType}`;
        }
      }
      // Other categories stay flat (Payroll, Banking, Legal, Taxes, Other)

      return path;
    };

    // Determine target folder and actions based on destination
    let targetFolder: string;
    let syncToQuickBooks = false;
    let finalStatus = 'processed';

    switch (destination) {
      case 'quickbooks':
        targetFolder = buildPath();
        syncToQuickBooks = true;
        break;
      case 'drive_only':
        targetFolder = buildPath();
        syncToQuickBooks = false;
        break;
      case 'archive':
        targetFolder = `All Files/Archive`;
        syncToQuickBooks = false;
        break;
      case 'manual_entry':
        targetFolder = `All Files/Pending Review`;
        syncToQuickBooks = false;
        finalStatus = 'pending_manual';
        break;
      case 'not_billable':
        targetFolder = `All Files/Not Billable`;
        syncToQuickBooks = false;
        break;
      default:
        targetFolder = buildPath();
        syncToQuickBooks = true;
    }

    // Handle Google Drive - either upload generated invoice or move existing file
    let actualDriveId = doc.drive_id;

    // Check if this is a generated invoice (not yet uploaded to Drive)
    if (doc.drive_id?.startsWith('generated_')) {
      console.log('📄 Generated invoice detected, uploading to Google Drive...');

      // Get PDF buffer from metadata
      const pdfBuffer = meta.pdfBuffer || meta.pdfDataUrl?.split(',')[1];

      if (pdfBuffer) {
        try {
          const buffer = Buffer.from(pdfBuffer, 'base64');
          const invoiceNumber = meta.invoiceNumber || doc.drive_id.replace('generated_', '');
          const vendorName = meta.data?.vendorName || 'Unknown';
          const fileName = `Invoice_${invoiceNumber}_${vendorName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

          // Upload directly to target folder
          const driveFileId = await uploadBufferToDrive(buffer, fileName, 'application/pdf', targetFolder);

          if (driveFileId) {
            actualDriveId = driveFileId;
            console.log(`✅ Generated invoice uploaded to Drive: ${driveFileId}`);

            // Update the document with the real drive_id
            await supabase
              .from('documents')
              .update({ drive_id: driveFileId })
              .eq('id', documentId);
          }
        } catch (uploadError) {
          console.error('❌ Failed to upload generated invoice:', uploadError);
        }
      } else {
        console.log('⚠️ No PDF buffer found for generated invoice');
      }
    } else {
      // Regular file - move from Unprocessed Files to target folder
      try {
        await moveFileToFolder(doc.drive_id, targetFolder);
        console.log(`📁 Moved file to ${targetFolder}`);
      } catch (driveError) {
        console.log('Drive move skipped:', driveError);
      }
    }

    // Sync to QuickBooks if destination requires it
    let qbSyncResult = null;
    console.log(`🎯 [Confirm] Destination: ${destination}, syncToQuickBooks: ${syncToQuickBooks}`);

    if (syncToQuickBooks) {
      console.log(`🎯 [Confirm] Calling syncBillToQuickBooks for ${analysis.data?.vendorName} - $${analysis.data?.amount}`);
      try {
        qbSyncResult = await syncBillToQuickBooks(doc, analysis);
        console.log(`📊 [Confirm] QuickBooks sync result:`, qbSyncResult);
      } catch (qbError) {
        console.error('❌ [Confirm] QuickBooks sync error:', qbError);
        qbSyncResult = { success: false, reason: String(qbError) };
      }
    } else {
      console.log(`⏭️ [Confirm] Skipping QuickBooks sync (destination: ${destination})`);
    }

    // Update status with destination info and QB sync result
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        status: finalStatus,
        processed_at: new Date().toISOString(),
        // Store destination and QB sync result in metadata for audit trail
        metadata: {
          ...analysis,
          destination,
          targetFolder,
          quickbooksSync: qbSyncResult
        }
      })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Supabase update failed: ${updateError.message}`);
    }

    console.log(`✅ Document ${documentId} processed → ${destination}`);
    return {
      success: true,
      destination,
      targetPath: targetFolder,
      syncedToQuickBooks: syncToQuickBooks,
      quickbooksResult: qbSyncResult
    };

  } catch (error) {
    console.error("Execution Failed:", error);
    throw error;
  }
}

/**
 * Reject a document
 */
export async function rejectDocument(documentId: string) {
  // Get document for drive_id
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('drive_id')
    .eq('id', documentId)
    .single();

  if (fetchError) {
    throw new Error(`Supabase fetch failed: ${fetchError.message}`);
  }

  // Move in Drive (skip if file doesn't exist)
  if (doc?.drive_id) {
    try {
      await moveFileToFolder(doc.drive_id, 'All Files/Rejected');
    } catch (driveError) {
      console.log('Drive move skipped:', driveError);
    }
  }

  // Update status - try with rejected_at, fall back to without if column doesn't exist
  const now = new Date().toISOString();
  let updateError = null;

  // First try with rejected_at
  const { error: err1 } = await supabase
    .from('documents')
    .update({
      status: 'rejected',
      processed_at: now,
      rejected_at: now
    })
    .eq('id', documentId);

  if (err1) {
    // If rejected_at column doesn't exist, try without it
    console.log('Retrying without rejected_at:', err1.message);
    const { error: err2 } = await supabase
      .from('documents')
      .update({
        status: 'rejected',
        processed_at: now
      })
      .eq('id', documentId);
    updateError = err2;
  }

  if (updateError) {
    throw new Error(`Supabase update failed: ${updateError.message}`);
  }

  return { success: true };
}

/**
 * Dismiss/delete a document from Supabase (for orphaned records)
 * Use this when the Drive file no longer exists
 */
export async function dismissDocument(documentId: string) {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to dismiss document: ${error.message}`);
  }

  return { success: true, deleted: true };
}

/**
 * Get all documents needing review
 */
export async function getPendingDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('status', 'needs_review')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }

  return data || [];
}
