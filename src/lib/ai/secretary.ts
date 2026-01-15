// The "Secretary" - Business logic for Trust but Verify workflow
// Handles Phase 1 (Analyze & Hold) and Phase 2 (Execute on Confirm)

import { supabase } from '@/lib/supabase';
import { visionModel } from '@/lib/gemini';

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
 */
export async function analyzeUploadedFile(fileId: string, fileContent: string) {
  console.log(`🕵️‍♂️ Analyzing file: ${fileId}`);

  // 1. Run Gemini Analysis
  const analysis: DocumentAnalysis = await analyzeAndCategorize(fileContent);

  // 2. DUPLICATE DETECTION LOGIC
  // Check for existing docs with same Vendor + Amount within the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: potentialDupes } = await supabase
    .from('documents')
    .select('id, created_at, metadata')
    .filter('metadata->>vendorName', 'eq', analysis.data.vendorName)
    .filter('metadata->>amount', 'eq', String(analysis.data.amount))
    .gte('created_at', thirtyDaysAgo);

  const isDuplicate = potentialDupes && potentialDupes.length > 0;

  // 3. Save to DB (Status: 'needs_review')
  const { data, error } = await supabase
    .from('documents')
    .insert({
      drive_id: fileId,
      content: fileContent,
      metadata: analysis,
      category: analysis.category,
      status: 'needs_review', // <--- THE GUARDRAIL
      is_duplicate: isDuplicate,
      duplicate_of_id: isDuplicate ? potentialDupes[0].id : null
    })
    .select()
    .single();

  if (error) {
    console.error("DB Insert Error:", error);
    throw new Error(`Database Error: ${error.message}`);
  }
  
  console.log(`✅ Document saved with status: needs_review, isDuplicate: ${isDuplicate}`);
  return data;
}

/**
 * PHASE 2: EXECUTE
 * Triggered ONLY when Mary clicks "Confirm"
 */
export async function confirmAndExecute(documentId: string) {
  console.log(`🚀 Executing confirmation for document: ${documentId}`);
  
  // 1. Fetch the Draft
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
    // 2. Here you would integrate with:
    // - Google Drive API to move file to categorized folder
    // - QuickBooks API to create the bill/expense
    
    // For now, we'll just update the status
    console.log(`📁 Would move file ${doc.drive_id} to folder: ${analysis.category}`);
    console.log(`📊 Would create QuickBooks entry for: $${analysis.data.amount} to ${analysis.data.vendorName}`);

    // 3. Update Status to 'processed'
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
 * Reject a document (mark as rejected)
 */
export async function rejectDocument(documentId: string) {
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
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return data || [];
}
