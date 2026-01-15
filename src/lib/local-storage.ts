// Local JSON file storage - Alternative to Supabase for demos
// Stores pending documents in a local JSON file

import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'documents.json');

export interface LocalDocument {
  id: string;
  drive_id: string;
  content: string;
  metadata: unknown;
  category: string;
  status: 'needs_review' | 'processed' | 'rejected' | 'archived';
  is_duplicate: boolean;
  duplicate_of_id: string | null;
  created_at: string;
  processed_at?: string;
}

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Read all documents from file
function readDocuments(): LocalDocument[] {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading documents file:', error);
  }
  return [];
}

// Write documents to file
function writeDocuments(docs: LocalDocument[]) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(docs, null, 2));
}

// Insert a new document
export function insertDocument(doc: Omit<LocalDocument, 'id' | 'created_at'>): LocalDocument {
  const docs = readDocuments();
  const newDoc: LocalDocument = {
    ...doc,
    id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    created_at: new Date().toISOString(),
  };
  docs.push(newDoc);
  writeDocuments(docs);
  console.log(`✅ Document saved locally: ${newDoc.id}`);
  return newDoc;
}

// Get documents by status
export function getDocumentsByStatus(status: string): LocalDocument[] {
  const docs = readDocuments();
  return docs.filter(d => d.status === status).sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// Get document by ID
export function getDocumentById(id: string): LocalDocument | null {
  const docs = readDocuments();
  return docs.find(d => d.id === id) || null;
}

// Update document status
export function updateDocumentStatus(id: string, status: LocalDocument['status']): boolean {
  const docs = readDocuments();
  const index = docs.findIndex(d => d.id === id);
  if (index === -1) return false;
  
  docs[index].status = status;
  docs[index].processed_at = new Date().toISOString();
  writeDocuments(docs);
  console.log(`✅ Document ${id} updated to: ${status}`);
  return true;
}

// Check for duplicates (same vendor + amount in last 30 days)
export function checkDuplicate(vendorName: string, amount: number): LocalDocument | null {
  const docs = readDocuments();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  return docs.find(d => {
    const meta = d.metadata as { data?: { vendorName?: string; amount?: number } };
    const docDate = new Date(d.created_at).getTime();
    return (
      docDate > thirtyDaysAgo &&
      meta?.data?.vendorName === vendorName &&
      meta?.data?.amount === amount
    );
  }) || null;
}
