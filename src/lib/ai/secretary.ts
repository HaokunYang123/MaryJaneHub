// The "Secretary" - Business logic for Trust but Verify workflow
// Handles Phase 1 (Analyze & Hold) and Phase 2 (Execute on Confirm)
// Uses Google Drive for file storage + Supabase for metadata

import { supabase } from '@/lib/supabase';
import { visionModel } from '@/lib/gemini';
import { moveFileToFolder, getFolderByStatus } from '@/lib/google-drive';

// Strict Type Definition for the AI's Output
export interface DocumentAnalysis {
  summary: string;
  category: string;
  confidence: number;
  data: {
    vendorName: string;
    amount: number;
    date: string;
    description: string;
  };
  quickbooksData?: {
    accountName: string;
    classRef: string;
  };
}

/**
 * Analyze document content using Gemini
 */
async function analyzeAndCategorize(content: string): Promise<DocumentAnalysis> {
  const prompt = `
    Analyze this document/invoice text and extract information.
    
    Categories to choose from:
    - Invoice (bills to pay)
    - Receipt (proof of payment)
    - Contract (agreements, leases)
    - Tax Document (1099, W2, etc.)
    - Bank Statement
    - Insurance
    - Other

    For 280E Tax Compliance:
    - If vendor sells cultivation supplies, seeds, nutrients, packaging = COGS (Deductible)
    - If vendor is for rent, office, marketing, legal, utilities = OpEx (Non-Deductible)

    Return ONLY raw JSON with this structure:
    {
      "summary": "Brief description of the document",
      "category": "One of the categories above",
      "confidence": 0.0-1.0,
      "data": {
        "vendorName": "Company name or 'Unknown'",
        "amount": 0.00,
        "date": "YYYY-MM-DD or today's date if not found",
        "description": "What is this for"
      },
      "quickbooksData": {
        "accountName": "Suggested GL account",
        "classRef": "COGS - Deductible or OpEx - Non-Deductible"
      }
    }

    Document Text:
    ${content.substring(0, 3000)}
  `;

  try {
    const result = await visionModel.generateContent(prompt);
    const response = result.response;
    let text = response.text();
    
    // Clean up markdown code blocks if Gemini adds them
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(text) as DocumentAnalysis;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Return default analysis if AI fails
    return {
      summary: "Unable to analyze document",
      category: "Other",
      confidence: 0,
      data: {
        vendorName: "Unknown",
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        description: "Document requires manual review"
      }
    };
  }
}

/**
 * PHASE 1: ANALYZE & HOLD
 * Analyzes the file, checks for duplicates, and saves as "needs_review"
 * File stays in Drive Inbox, metadata goes to Supabase
 */
export async function analyzeUploadedFile(fileId: string, fileContent: string) {
  console.log(`🕵️‍♂️ Analyzing file: ${fileId}`);

  // 1. Run Gemini Analysis
  const analysis: DocumentAnalysis = await analyzeAndCategorize(fileContent);

  // 2. DUPLICATE DETECTION LOGIC
  // Check for existing docs with same Vendor + Amount within the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  let isDuplicate = false;
  let duplicateId = null;
  
  try {
    const { data: potentialDupes } = await supabase
      .from('documents')
      .select('id, created_at, metadata')
      .filter('metadata->>vendorName', 'eq', analysis.data.vendorName)
      .filter('metadata->>amount', 'eq', String(analysis.data.amount))
      .gte('created_at', thirtyDaysAgo);

    isDuplicate = potentialDupes && potentialDupes.length > 0;
    duplicateId = isDuplicate ? potentialDupes![0].id : null;
  } catch (error) {
    console.log('Duplicate check skipped (Supabase may not be configured):', error);
  }

  // 3. Save to Supabase (Status: 'needs_review')
  try {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        drive_id: fileId,
        content: fileContent,
        metadata: analysis,
        category: analysis.category,
        status: 'needs_review',
        is_duplicate: isDuplicate,
        duplicate_of_id: duplicateId
      })
      .select()
      .single();

    if (error) {
      console.error("DB Insert Error:", error);
      // Return mock data if Supabase fails
      return {
        id: `mock_${Date.now()}`,
        drive_id: fileId,
        content: fileContent,
        metadata: analysis,
        category: analysis.category,
        status: 'needs_review',
        is_duplicate: isDuplicate,
        created_at: new Date().toISOString()
      };
    }
    
    console.log(`✅ Document saved with status: needs_review, isDuplicate: ${isDuplicate}`);
    return data;
  } catch (error) {
    console.log('Supabase not configured, returning mock data');
    return {
      id: `mock_${Date.now()}`,
      drive_id: fileId,
      content: fileContent,
      metadata: analysis,
      category: analysis.category,
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

  const analysis = doc.metadata as DocumentAnalysis;

  try {
    // 2. Move file in Google Drive to "Processed" folder
    try {
      const processedFolderId = await getFolderByStatus('processed');
      await moveFileToFolder(doc.drive_id, `Mary - Processed/${analysis.category}`);
      console.log(`📁 Moved file ${doc.drive_id} to Processed folder`);
    } catch (driveError) {
      console.log('Google Drive move skipped (may not be configured):', driveError);
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
