// The "Secretary" - Business logic for Trust but Verify workflow
// Uses Supabase if configured, falls back to local JSON storage

import { analyzeAndCategorize, AIAnalysisResult } from '@/lib/invoice-extractor';
import { moveFileToFolder, getFolderByStatus } from '@/lib/google-drive';
import { 
  insertDocument, 
  getDocumentsByStatus, 
  getDocumentById, 
  updateDocumentStatus,
  checkDuplicate,
  LocalDocument 
} from '@/lib/local-storage';

// Check if Supabase is configured
const SUPABASE_CONFIGURED = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Dynamic import of supabase only if configured
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: any = null;
if (SUPABASE_CONFIGURED) {
  import('@/lib/supabase').then(m => { supabase = m.supabase; });
}

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
    const doc = saveDocument({
      drive_id: fileId,
      content: fileContent,
      metadata: analysis,
      category: analysis.filingCategory,
      status: 'archived',
      is_duplicate: false,
      duplicate_of_id: null,
    });
    
    return { 
      success: true, 
      message: "Archived non-financial document",
      ...doc,
      status: 'archived'
    };
  }

  // 3. Check for duplicates
  let isDuplicate = false;
  let duplicateId: string | null = null;

  if (SUPABASE_CONFIGURED && supabase) {
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
      console.log('Duplicate check failed:', error);
    }
  } else {
    // Use local storage for duplicate check
    const dupe = checkDuplicate(analysis.data.vendorName, analysis.data.amount);
    isDuplicate = !!dupe;
    duplicateId = dupe?.id || null;
  }

  // 4. Save Document
  const savedDoc = saveDocument({
    drive_id: fileId,
    content: fileContent,
    metadata: analysis,
    category: analysis.filingCategory,
    status: 'needs_review',
    is_duplicate: isDuplicate,
    duplicate_of_id: duplicateId,
  });

  console.log(`✅ Document saved: ${savedDoc.id}, isDuplicate: ${isDuplicate}`);
  return savedDoc;
}

/**
 * Save document to Supabase or local storage
 */
function saveDocument(data: {
  drive_id: string;
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any;
  category: string;
  status: 'needs_review' | 'processed' | 'rejected' | 'archived';
  is_duplicate: boolean;
  duplicate_of_id: string | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  if (SUPABASE_CONFIGURED && supabase) {
    // Try Supabase first
    try {
      const result = supabase
        .from('documents')
        .insert(data)
        .select()
        .single();
      
      if (result.data) return result.data;
    } catch (error) {
      console.log('Supabase save failed, using local storage:', error);
    }
  }

  // Fall back to local storage
  console.log('📁 Using local file storage');
  return insertDocument(data);
}

/**
 * PHASE 2: EXECUTE
 * Triggered ONLY when Mary clicks "Confirm"
 */
export async function confirmAndExecute(documentId: string) {
  console.log(`🚀 Confirming document: ${documentId}`);
  
  // Get document
  let doc: LocalDocument | null = null;
  
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();
      doc = data;
    } catch {
      // Fall back to local
    }
  }
  
  if (!doc) {
    doc = getDocumentById(documentId);
  }

  if (!doc) {
    throw new Error("Document not found");
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
    if (SUPABASE_CONFIGURED && supabase) {
      await supabase
        .from('documents')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', documentId);
    } else {
      updateDocumentStatus(documentId, 'processed');
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
  let doc: LocalDocument | null = null;
  
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data } = await supabase
        .from('documents')
        .select('drive_id')
        .eq('id', documentId)
        .single();
      doc = data;
    } catch {
      // Fall back
    }
  }
  
  if (!doc) {
    doc = getDocumentById(documentId);
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
  if (SUPABASE_CONFIGURED && supabase) {
    await supabase
      .from('documents')
      .update({ status: 'rejected', processed_at: new Date().toISOString() })
      .eq('id', documentId);
  } else {
    updateDocumentStatus(documentId, 'rejected');
  }

  return { success: true };
}

/**
 * Get all documents needing review
 */
export async function getPendingDocuments() {
  if (SUPABASE_CONFIGURED && supabase) {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('status', 'needs_review')
        .order('created_at', { ascending: false });

      if (!error && data) return data;
    } catch (error) {
      console.log('Supabase fetch failed:', error);
    }
  }

  // Fall back to local storage
  console.log('📁 Fetching from local storage');
  return getDocumentsByStatus('needs_review');
}
