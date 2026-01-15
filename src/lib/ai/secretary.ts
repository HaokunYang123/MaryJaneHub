// The "Secretary" - Business logic for Trust but Verify workflow
// Handles Phase 1 (Analyze & Hold) and Phase 2 (Execute on Confirm)
// Uses Google Drive for file storage + Supabase for metadata

import { analyzeAndCategorize, AIAnalysisResult } from '@/lib/invoice-extractor';
import { supabase } from '@/lib/supabase';
import { moveFileToFolder, getFolderByStatus } from '@/lib/google-drive';

/**
 * PHASE 1: ANALYZE & HOLD
 * Analyzes the file with context-aware AI
 * - 'web' source: Aggressive mode (assume financial)
 * - 'drive' source: Cautious mode (check if financial first)
 */
export async function analyzeUploadedFile(
  fileId: string, 
  fileContent: string, 
  source: 'web' | 'drive' = 'web'
) {
  console.log(`🕵️‍♂️ Analyzing file: ${fileId} (Source: ${source})`);

  // 1. Run AI with the Source Context
  const analysis: AIAnalysisResult = await analyzeAndCategorize(fileContent, source);

  // 2. LOGIC FOR NON-FINANCIAL FILES (The "EIN Letter" Case)
  if (!analysis.isFinancial && source === 'drive') {
    console.log(`📂 Non-financial file detected: ${analysis.summary}`);
    
    // Just organize it in Drive, don't draft it for QuickBooks
    try {
      await moveFileToFolder(fileId, analysis.filingCategory);
    } catch (driveError) {
      console.log('Drive move skipped:', driveError);
    }
    
    // Save to DB as "archived" just for memory (skips Review Queue)
    try {
      await supabase.from('documents').insert({
        drive_id: fileId,
        content: fileContent,
        metadata: analysis,
        category: analysis.filingCategory,
        status: 'archived', // <--- Skips the Review Queue
      });
    } catch (dbError) {
      console.log('DB insert skipped:', dbError);
    }
    
    return { 
      success: true, 
      message: "Archived non-financial document",
      analysis,
      status: 'archived'
    };
  }

  // 3. LOGIC FOR FINANCIAL FILES (Business as usual)
  // Check for duplicates within last 30 days
  let isDuplicate = false;
  let duplicateId = null;

  try {
    const { data: duplicates } = await supabase
      .from('documents')
      .select('id')
      .filter('metadata->>vendorName', 'eq', analysis.data.vendorName)
      .filter('metadata->>amount', 'eq', String(analysis.data.amount))
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    isDuplicate = duplicates && duplicates.length > 0;
    duplicateId = isDuplicate ? duplicates![0].id : null;
  } catch (error) {
    console.log('Duplicate check skipped:', error);
  }

  // 4. Save to DB for Review
  try {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        drive_id: fileId,
        content: fileContent,
        metadata: analysis,
        category: analysis.filingCategory,
        status: 'needs_review',
        is_duplicate: isDuplicate,
        duplicate_of_id: duplicateId
      })
      .select()
      .single();

    if (error) {
      console.error("DB Insert Error:", error);
      return {
        id: `mock_${Date.now()}`,
        drive_id: fileId,
        content: fileContent,
        metadata: analysis,
        category: analysis.filingCategory,
        status: 'needs_review',
        is_duplicate: isDuplicate,
        created_at: new Date().toISOString()
      };
    }
    
    console.log(`✅ Document saved: needs_review, isDuplicate: ${isDuplicate}`);
    return data;
  } catch (error) {
    console.log('Supabase not configured, returning mock data');
    return {
      id: `mock_${Date.now()}`,
      drive_id: fileId,
      content: fileContent,
      metadata: analysis,
      category: analysis.filingCategory,
      status: 'needs_review',
      is_duplicate: isDuplicate,
      created_at: new Date().toISOString()
    };
  }
}

/**
 * PHASE 2: EXECUTE
 * Triggered ONLY when Mary clicks "Confirm"
 * Moves file in Drive + Updates Supabase status
 */
export async function confirmAndExecute(documentId: string) {
  console.log(`🚀 Executing confirmation for document: ${documentId}`);
  
  // 1. Fetch the Draft from Supabase
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchError || !doc) {
    throw new Error("Document not found");
  }
  
  if (doc.status === 'processed') {
    throw new Error("Document already processed");
  }

  const analysis = doc.metadata as AIAnalysisResult;

  try {
    // 2. Move file in Google Drive to "Processed" folder
    try {
      await getFolderByStatus('processed');
      await moveFileToFolder(doc.drive_id, `Mary - Processed/${analysis.filingCategory}`);
      console.log(`📁 Moved file ${doc.drive_id} to Processed folder`);
    } catch (driveError) {
      console.log('Google Drive move skipped:', driveError);
    }

    // 3. Here you would also sync to QuickBooks
    console.log(`📊 Would create QuickBooks entry for: $${analysis.data.amount} to ${analysis.data.vendorName}`);

    // 4. Update Supabase Status to 'processed'
    const { error: updateError } = await supabase
      .from('documents')
      .update({ 
        status: 'processed', 
        processed_at: new Date().toISOString() 
      })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Failed to update status: ${updateError.message}`);
    }

    console.log(`✅ Document ${documentId} marked as processed`);
    return { success: true, analysis };

  } catch (error) {
    console.error("Execution Failed:", error);
    throw error;
  }
}

/**
 * Reject a document
 * Moves file in Drive to Rejected folder + Updates Supabase
 */
export async function rejectDocument(documentId: string) {
  // 1. Fetch doc
  const { data: doc } = await supabase
    .from('documents')
    .select('drive_id')
    .eq('id', documentId)
    .single();

  // 2. Move in Drive
  if (doc?.drive_id) {
    try {
      await moveFileToFolder(doc.drive_id, 'Mary - Rejected');
      console.log(`📁 Moved file to Rejected folder`);
    } catch (driveError) {
      console.log('Google Drive move skipped:', driveError);
    }
  }

  // 3. Update Supabase
  const { error } = await supabase
    .from('documents')
    .update({ 
      status: 'rejected', 
      processed_at: new Date().toISOString() 
    })
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to reject document: ${error.message}`);
  }

  return { success: true };
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
    console.error('Failed to fetch documents:', error);
    return [];
  }

  return data || [];
}
