// The "Secretary" - Business logic for Trust but Verify workflow
// Supabase-only persistence (no local fallback)

import { analyzeAndCategorize, AIAnalysisResult } from '@/lib/invoice-extractor';
import { moveFileToFolder, getFolderByStatus } from '@/lib/google-drive';
import { supabase } from '@/lib/supabase';

/**
 * PHASE 1: ANALYZE & HOLD
 * Analyzes the file with context-aware AI
 */
export async function analyzeUploadedFile(
  fileId: string, 
  fileContent: string, 
  source: 'web' | 'drive' = 'web'
) {
  console.log(`🕵️‍♂️ Analyzing file: ${fileId} (Source: ${source})`);

  // 1. Run AI Analysis
  const analysis: AIAnalysisResult = await analyzeAndCategorize(fileContent, source);

  // 2. Handle Non-Financial Files (Drive source only)
  if (!analysis.isFinancial && source === 'drive') {
    console.log(`📂 Non-financial file detected: ${analysis.summary}`);
    
    try {
      await moveFileToFolder(fileId, analysis.filingCategory);
    } catch (driveError) {
      console.log('Drive move skipped:', driveError);
    }
    
    // Save as archived
    const { data: doc, error } = await supabase
      .from('documents')
      .insert({
        drive_id: fileId,
        content: fileContent,
        metadata: analysis,
        category: analysis.filingCategory,
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

  // 3. Check for duplicates
  let isDuplicate = false;
  let duplicateId: string | null = null;

  try {
    const { data: duplicates, error } = await supabase
      .from('documents')
      .select('id')
      .filter('metadata->>vendorName', 'eq', analysis.data.vendorName)
      .filter('metadata->>amount', 'eq', String(analysis.data.amount))
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      throw new Error(error.message);
    }

    isDuplicate = duplicates && duplicates.length > 0;
    duplicateId = isDuplicate ? duplicates![0].id : null;
  } catch (error) {
    console.log('Duplicate check failed:', error);
  }

  // 4. Save Document
  const { data: savedDoc, error: saveError } = await supabase
    .from('documents')
    .insert({
      drive_id: fileId,
      content: fileContent,
      metadata: analysis,
      category: analysis.filingCategory,
      status: 'needs_review',
      is_duplicate: isDuplicate,
      duplicate_of_id: duplicateId,
    })
    .select()
    .single();

  if (saveError) {
    throw new Error(`Supabase insert failed: ${saveError.message}`);
  }

  console.log(`✅ Document saved: ${savedDoc?.id}, isDuplicate: ${isDuplicate}`);
  return savedDoc;
}

/**
 * PHASE 2: EXECUTE
 * Triggered ONLY when Mary clicks "Confirm"
 */
export async function confirmAndExecute(documentId: string) {
  console.log(`🚀 Confirming document: ${documentId}`);
  
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
    // Move file in Drive
    try {
      await getFolderByStatus('processed');
      await moveFileToFolder(doc.drive_id, `Mary - Processed/${analysis.filingCategory}`);
      console.log(`📁 Moved file to Processed folder`);
    } catch (driveError) {
      console.log('Drive move skipped:', driveError);
    }

    // Update status
    const { error: updateError } = await supabase
      .from('documents')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('id', documentId);

    if (updateError) {
      throw new Error(`Supabase update failed: ${updateError.message}`);
    }

    console.log(`✅ Document ${documentId} processed`);
    return { success: true, analysis };

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

  // Move in Drive
  if (doc?.drive_id) {
    try {
      await moveFileToFolder(doc.drive_id, 'Mary - Rejected');
    } catch (driveError) {
      console.log('Drive move skipped:', driveError);
    }
  }

  // Update status
  const { error: updateError } = await supabase
    .from('documents')
    .update({ status: 'rejected', processed_at: new Date().toISOString() })
    .eq('id', documentId);

  if (updateError) {
    throw new Error(`Supabase update failed: ${updateError.message}`);
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
    throw new Error(`Supabase fetch failed: ${error.message}`);
  }

  return data || [];
}
