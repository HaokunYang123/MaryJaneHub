/**
 * RAG (Retrieval-Augmented Generation) Handler for Assistant
 *
 * Retrieves relevant documents and synthesizes answers across multiple sources
 * with proper citations.
 */

import { getSupabase } from "../supabase/client";
import { getGeminiModel } from "../gemini/client";
import { generateContentWithTimeout } from "../gemini/call";
import { smartSearch } from "../search/smart-search";
import type { Slots, RAGResult, RAGDocumentRef, Citation, ConfidenceLevel, AssistantMode } from "./types";
import { INSUFFICIENT_INFO_MESSAGE } from "./messages";

/**
 * Document record from database
 */
interface DocumentRecord {
  id: string;
  file_name: string;
  document_type: string;
  raw_text: string;
  extraction: Record<string, unknown>;
  relevanceScore?: number;
}

/**
 * Extract key data from document extraction
 */
function extractKeyData(extraction: Record<string, unknown>): {
  vendor?: string;
  date?: string;
  total?: number;
} {
  const data = (extraction?.data || extraction) as Record<string, unknown>;
  return {
    vendor: (data?.vendor || data?.merchant_name) as string | undefined,
    date: (data?.invoice_date || data?.date) as string | undefined,
    total: data?.total as number | undefined,
  };
}

/**
 * Build a summary of document for context
 */
function buildDocumentSummary(doc: DocumentRecord): string {
  const keyData = extractKeyData(doc.extraction);
  const data = (doc.extraction?.data || doc.extraction) as Record<string, unknown>;

  const parts: string[] = [];
  parts.push(`File: ${doc.file_name}`);
  parts.push(`Type: ${doc.document_type}`);

  if (keyData.vendor) parts.push(`Vendor: ${keyData.vendor}`);
  if (keyData.date) parts.push(`Date: ${keyData.date}`);
  if (keyData.total) parts.push(`Amount: $${keyData.total.toFixed(2)}`);

  // Add other relevant fields
  if (data?.invoice_number) parts.push(`Invoice #: ${data.invoice_number}`);
  if (data?.due_date) parts.push(`Due: ${data.due_date}`);

  // Add raw text snippet (first 800 chars, cleaned up)
  if (doc.raw_text) {
    const snippet = doc.raw_text
      .slice(0, 800)
      .replace(/\s+/g, " ")
      .trim();
    parts.push(`Content: ${snippet}${doc.raw_text.length > 800 ? "..." : ""}`);
  }

  return parts.join("\n");
}

/**
 * Retrieve relevant documents using semantic search
 */
async function retrieveRelevantDocuments(
  query: string,
  slots: Slots,
  limit: number = 10
): Promise<DocumentRecord[]> {
  console.log(`[RAG] Retrieving documents for: "${query}"`);

  // Use smart search to find relevant documents
  const searchResult = await smartSearch(query, { limit: limit + 5 });

  if (!searchResult.success || !searchResult.results.length) {
    console.log("[RAG] No documents found via search");
    return [];
  }

  let documents = searchResult.results.map((r, index) => ({
    id: r.id,
    file_name: r.fileName,
    document_type: r.documentType,
    raw_text: r.rawText || "",
    extraction: r.extraction as Record<string, unknown>,
    relevanceScore: 1 - index * 0.05, // Approximate relevance from ranking
  }));

  // Apply additional filters from slots
  if (slots.documentType) {
    documents = documents.filter((d) => d.document_type === slots.documentType);
  }

  if (slots.year) {
    documents = documents.filter((d) => {
      const keyData = extractKeyData(d.extraction);
      return keyData.date?.startsWith(String(slots.year));
    });
  }

  if (slots.vendor) {
    const vendorLower = slots.vendor.toLowerCase();
    documents = documents.filter((d) => {
      const keyData = extractKeyData(d.extraction);
      return keyData.vendor?.toLowerCase().includes(vendorLower);
    });
  }

  // If no documents match after filtering, try direct database query
  if (documents.length === 0) {
    console.log("[RAG] No documents after filtering, trying direct query");
    documents = await queryDocumentsDirectly(slots, limit);
  }

  console.log(`[RAG] Found ${documents.length} relevant documents`);
  return documents.slice(0, limit);
}

/**
 * Query documents directly from database when search doesn't find matches
 */
async function queryDocumentsDirectly(
  slots: Slots,
  limit: number
): Promise<DocumentRecord[]> {
  const supabase = getSupabase();

  let query = supabase
    .from("documents")
    .select("id, file_name, document_type, raw_text, extraction")
    .order("created_at", { ascending: false })
    .limit(limit * 2);

  if (slots.documentType) {
    query = query.eq("document_type", slots.documentType);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("[RAG] Direct query error:", error);
    return [];
  }

  let documents = data as DocumentRecord[];

  // Apply year filter
  if (slots.year) {
    documents = documents.filter((d) => {
      const keyData = extractKeyData(d.extraction);
      return keyData.date?.startsWith(String(slots.year));
    });
  }

  // Apply vendor filter
  if (slots.vendor) {
    const vendorLower = slots.vendor.toLowerCase();
    documents = documents.filter((d) => {
      const keyData = extractKeyData(d.extraction);
      return keyData.vendor?.toLowerCase().includes(vendorLower);
    });
  }

  return documents.slice(0, limit).map((d, i) => ({
    ...d,
    relevanceScore: 0.7 - i * 0.03,
  }));
}

/**
 * Build the prompt for Gemini to synthesize an answer
 */
function buildRAGPrompt(query: string, documents: DocumentRecord[], mode: AssistantMode): string {
  const documentContexts = documents
    .map((doc, i) => `--- Document ${i + 1} ---\n${buildDocumentSummary(doc)}`)
    .join("\n\n");

  const modeInstructions =
    mode === "lawyer"
      ? `6. Prefer short direct quotes from the documents for key facts (use quotation marks)\n` +
        `7. Clearly mark uncertainty (e.g., \"Not found in the documents\")\n` +
        `8. Do NOT provide legal advice or speculative legal reasoning\n`
      : `6. Be concise and practical for the owner\n` +
        `7. Prefer short direct quotes when helpful (use quotation marks)\n`;

  return `You are a helpful assistant answering questions about business documents.

IMPORTANT RULES:
1. Answer ONLY based on the documents provided below
2. If information is not in the documents, say "I don't have enough information about that"
3. When stating facts, ALWAYS cite the source document by filename in brackets: [filename.pdf]
4. Be specific and include relevant details (dates, amounts, vendors)
5. If multiple documents are relevant, synthesize information from all of them
${modeInstructions}

USER QUESTION: ${query}

AVAILABLE DOCUMENTS:
${documentContexts}

Provide a comprehensive answer with citations. Include specific details like dates, amounts, and document references.`;
}

/**
 * Generate synthesized answer using Gemini
 */
async function synthesizeAnswer(
  query: string,
  documents: DocumentRecord[],
  mode: AssistantMode
): Promise<string> {
  const model = getGeminiModel();
  const prompt = buildRAGPrompt(query, documents, mode);

  try {
    const result = await generateContentWithTimeout(model, prompt);
    return typeof result.response.text === "function"
      ? result.response.text()
      : (result.response.text ?? "");
  } catch (error) {
    console.error("[RAG] Gemini error:", error);
    throw error;
  }
}

/**
 * Extract citations from the answer and verify against documents
 */
function extractCitations(
  answer: string,
  documents: DocumentRecord[]
): Citation[] {
  const citations: Citation[] = [];

  // Find all [filename] references
  const citationPattern = /\[([^\]]+\.pdf)\]/gi;
  let match;

  while ((match = citationPattern.exec(answer)) !== null) {
    const citedFileName = match[1];

    // Find the matching document
    const doc = documents.find(
      (d) => d.file_name.toLowerCase() === citedFileName.toLowerCase() ||
             d.file_name.toLowerCase().includes(citedFileName.toLowerCase().replace(".pdf", ""))
    );

    if (doc) {
      // Extract the sentence containing this citation for context
      const citationIndex = match.index;
      const start = Math.max(0, answer.lastIndexOf(".", citationIndex - 100) + 1);
      const end = answer.indexOf(".", citationIndex) + 1 || answer.length;
      const excerpt = answer.slice(start, end).trim();

      // Check if citation is already added
      const existing = citations.find(
        (c) => c.docId === doc.id && c.excerpt === excerpt
      );

      if (!existing) {
        citations.push({
          docId: doc.id,
          fileName: doc.file_name,
          span: [0, 0], // Not tracking span in raw_text for RAG
          excerpt: excerpt.length > 200 ? excerpt.slice(0, 200) + "..." : excerpt,
          verified: true, // Document exists
        });
      }
    }
  }

  return citations;
}

/**
 * Calculate confidence based on documents and citations
 */
function calculateConfidence(
  documents: DocumentRecord[],
  citations: Citation[]
): ConfidenceLevel {
  if (documents.length === 0) return "low";
  if (citations.length >= 2 && documents.length >= 3) return "high";
  if (citations.length >= 1 && documents.length >= 1) return "medium";
  return "low";
}

/**
 * Calculate date range from documents
 */
function calculateDateRange(
  documents: DocumentRecord[]
): { earliest: string; latest: string } | undefined {
  const dates: string[] = [];

  for (const doc of documents) {
    const keyData = extractKeyData(doc.extraction);
    if (keyData.date) {
      dates.push(keyData.date);
    }
  }

  if (dates.length === 0) return undefined;

  dates.sort();
  return {
    earliest: dates[0],
    latest: dates[dates.length - 1],
  };
}

/**
 * Calculate total amount from documents
 */
function calculateTotalAmount(documents: DocumentRecord[]): number | undefined {
  let total = 0;
  let hasAmount = false;

  for (const doc of documents) {
    const keyData = extractKeyData(doc.extraction);
    if (keyData.total && keyData.total > 0) {
      total += keyData.total;
      hasAmount = true;
    }
  }

  return hasAmount ? Math.round(total * 100) / 100 : undefined;
}

/**
 * Main function: Execute RAG query
 */
export async function executeRAG(
  query: string,
  slots: Slots,
  options?: { mode?: AssistantMode }
): Promise<RAGResult> {
  console.log(`[RAG] Processing query: "${query}"`);
  const mode: AssistantMode = options?.mode ?? "owner";

  // Step 1: Retrieve relevant documents
  let documents: DocumentRecord[] = [];
  try {
    documents = await retrieveRelevantDocuments(query, slots, 10);
  } catch (error) {
    console.error("[RAG] Retrieval error:", error);
    return {
      answer: INSUFFICIENT_INFO_MESSAGE,
      citations: [],
      documentsUsed: [],
      confidence: "low",
      errorCode: "insufficient_info",
    };
  }

  if (documents.length === 0) {
    return {
      answer: "I couldn't find any relevant documents to answer your question. Could you try rephrasing or providing more details?",
      citations: [],
      documentsUsed: [],
      confidence: "low",
    };
  }

  // Step 2: Synthesize answer using Gemini
  let answer: string;
  try {
    answer = await synthesizeAnswer(query, documents, mode);
  } catch (error) {
    return {
      answer: INSUFFICIENT_INFO_MESSAGE,
      citations: [],
      documentsUsed: documents.map((d) => ({
        id: d.id,
        fileName: d.file_name,
        documentType: d.document_type,
        relevanceScore: d.relevanceScore || 0.5,
        extractedData: extractKeyData(d.extraction),
      })),
      confidence: "low",
      errorCode: "insufficient_info",
    };
  }

  // Step 3: Extract and verify citations
  const citations = extractCitations(answer, documents);

  // Step 4: Build result
  const documentsUsed: RAGDocumentRef[] = documents.map((d) => ({
    id: d.id,
    fileName: d.file_name,
    documentType: d.document_type,
    relevanceScore: d.relevanceScore || 0.5,
    extractedData: extractKeyData(d.extraction),
  }));

  const confidence = calculateConfidence(documents, citations);
  const totalAmount = calculateTotalAmount(documents);
  const dateRange = calculateDateRange(documents);

  console.log(`[RAG] Generated answer with ${citations.length} citations from ${documents.length} documents`);

  return {
    answer,
    citations,
    documentsUsed,
    confidence,
    totalAmount,
    dateRange,
  };
}

/**
 * Format RAG result as a human-readable message
 */
export function formatRAGResult(result: RAGResult, mode: AssistantMode = "owner"): string {
  if (mode === "lawyer") {
    return result.answer;
  }

  let message = result.answer;

  // Add summary section with disclaimer about document scope
  const docCount = result.documentsUsed.length;
  message += `\n\n---\n📊 Based on ${docCount} most relevant documents analyzed:`;

  if (result.totalAmount) {
    message += `\n• Amount in these docs: $${result.totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }
  if (result.dateRange) {
    message += `\n• Date range covered: ${result.dateRange.earliest} to ${result.dateRange.latest}`;
  }

  // Add hint about using sum for accurate totals
  if (result.totalAmount) {
    message += `\n\n💡 For accurate totals across all documents, try: "what's the total for [vendor] invoices"`;
  }

  return message;
}
