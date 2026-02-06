/**
 * Single Document QA with Verifiable Citations
 *
 * Answers questions about specific documents with citations that are
 * verified against the original raw text.
 */

import { getSupabase } from "../supabase/client";
import { getGeminiModel } from "../gemini/client";
import { generateContentWithTimeout } from "../gemini/call";
import type { Slots, Citation, QAResult, ConfidenceLevel, CandidateDocument, AssistantMode } from "./types";

/**
 * Document record from database (subset of fields we need)
 */
interface DocumentMatch {
  id: string;
  file_name: string;
  document_type: string;
  raw_text: string;
  extraction: Record<string, unknown>;
  created_at: string;
}

/**
 * Format document info into a readable summary
 */
function formatDocSummary(doc: DocumentMatch): string {
  const ext = doc.extraction as Record<string, unknown>;
  const data = (ext?.data || ext) as Record<string, unknown>;

  const parts: string[] = [];

  // Add amount if available
  const total = data?.total as number | undefined;
  if (total) {
    parts.push(`$${total.toFixed(2)}`);
  }

  // Add date if available
  const date = (data?.invoice_date || data?.date) as string | undefined;
  if (date) {
    try {
      const d = new Date(date);
      const formatted = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      parts.push(formatted);
    } catch {
      parts.push(date);
    }
  }

  return parts.join(", ") || doc.file_name;
}

/**
 * Find the target document based on slots
 */
async function findTargetDocument(
  slots: Slots
): Promise<
  | { success: true; document: DocumentMatch }
  | { success: false; error: "document_not_found" | "multiple_matches"; clarifyingQuestion?: string; matches?: DocumentMatch[] }
> {
  const supabase = getSupabase();

  // Build query - fetch documents and filter client-side for flexibility
  let query = supabase
    .from("documents")
    .select("id, file_name, document_type, raw_text, extraction, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  // Apply document type filter if specified
  if (slots.documentType) {
    query = query.eq("document_type", slots.documentType);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[SingleQA] Database error:", error);
    return { success: false, error: "document_not_found" };
  }

  if (!data || data.length === 0) {
    return { success: false, error: "document_not_found" };
  }

  // Score and filter documents based on slots
  const scored = scoreDocuments(data as DocumentMatch[], slots);

  // Filter to only documents with meaningful scores
  const meaningfulMatches = scored.filter((s) => s.score >= 0.3);

  if (meaningfulMatches.length === 0) {
    return { success: false, error: "document_not_found" };
  }

  // If best match is significantly better than others, use it
  if (meaningfulMatches.length === 1 || meaningfulMatches[0].score > meaningfulMatches[1].score + 0.15) {
    return { success: true, document: meaningfulMatches[0].doc };
  }

  // Multiple close matches - need clarification
  const topMatches = meaningfulMatches.slice(0, 3).map((s) => s.doc);
  const matchList = topMatches.map((d) => d.file_name).join(", ");

  return {
    success: false,
    error: "multiple_matches",
    clarifyingQuestion: `I found multiple matching documents: ${matchList}. Which one are you asking about?`,
    matches: topMatches,
  };
}

/**
 * Score documents based on slot matching
 */
function scoreDocuments(
  docs: DocumentMatch[],
  slots: Slots
): Array<{ doc: DocumentMatch; score: number }> {
  const results: Array<{ doc: DocumentMatch; score: number }> = [];

  for (const doc of docs) {
    let score = 0;
    const extraction = doc.extraction as Record<string, unknown>;
    const data = (extraction?.data || extraction) as Record<string, unknown>;

    // Match vendor in semantic text
    if (slots.semanticText && slots.semanticText.length > 2) {
      const keywords = slots.semanticText.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const vendor = (data?.vendor || data?.merchant_name || "") as string;
      const vendorLower = vendor.toLowerCase();
      const fileNameLower = doc.file_name.toLowerCase();
      const rawTextLower = (doc.raw_text || "").toLowerCase().slice(0, 2000);

      for (const kw of keywords) {
        if (vendorLower.includes(kw)) {
          score += 0.4;
        } else if (fileNameLower.includes(kw)) {
          score += 0.3;
        } else if (rawTextLower.includes(kw)) {
          score += 0.1;
        }
      }
    }

    // Match amount
    if (slots.amount) {
      const total = data?.total as number | undefined;
      if (total && Math.abs(total - slots.amount) < slots.amount * 0.05) {
        score += 0.5;
      }
    }

    // Match date
    if (slots.date || slots.year) {
      const docDate = (data?.invoice_date || data?.date) as string | undefined;
      if (docDate) {
        if (slots.date && docDate === slots.date) {
          score += 0.4;
        } else if (slots.year && docDate.startsWith(String(slots.year))) {
          score += 0.2;
        }
      }
    }

    // Document type match (already filtered, but boost if explicit)
    if (slots.documentType && doc.document_type === slots.documentType) {
      score += 0.1;
    }

    if (score > 0) {
      results.push({ doc, score });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Generate answer with citations using Gemini
 */
async function generateAnswerWithCitations(
  question: string,
  document: DocumentMatch,
  mode: AssistantMode
): Promise<{ answer: string; rawResponse: string }> {
  const model = getGeminiModel();

  const extraction = document.extraction as Record<string, unknown>;
  const data = (extraction?.data || extraction) as Record<string, unknown>;

  // Build context with extraction and raw text
  const extractionSummary = Object.entries(data)
    .filter(
      ([k, v]) =>
        v !== null &&
        k !== "confidence" &&
        k !== "raw_response" &&
        k !== "line_items" &&
        k !== "field_evidence"
    )
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const modeInstruction =
    mode === "lawyer"
      ? `5. Clearly mark uncertainty (e.g., "Not found in the document")\n` +
        `6. Do NOT provide legal advice or speculative legal reasoning\n`
      : `5. Be concise for the owner\n`;

  const prompt = `You are answering a question about a document. You MUST quote the EXACT text from the document that supports your answer.

DOCUMENT INFORMATION:
File: ${document.file_name}
Type: ${document.document_type}

EXTRACTED DATA:
${extractionSummary}

RAW DOCUMENT TEXT:
${document.raw_text?.slice(0, 4000) || "No raw text available"}

QUESTION: ${question}

INSTRUCTIONS:
1. Answer the question based on the document
2. Quote the EXACT text from the document that supports your answer using quotation marks
3. Be concise but include the key information
4. If you cannot find the answer in the document, say so
${modeInstruction}

RESPONSE FORMAT:
Provide your answer with quoted evidence from the document.`;

  try {
    const result = (await generateContentWithTimeout(model, prompt)) as {
      response: { text?: string | (() => string) };
    };
    const responseText =
      typeof result.response.text === "function"
        ? result.response.text()
        : (result.response.text ?? "");
    return { answer: responseText, rawResponse: responseText };
  } catch (error) {
    console.error("[SingleQA] Gemini error:", error);
    throw error;
  }
}

/**
 * Find span of a quote in raw text
 * Returns [start, end] or null if not found
 */
function findSpanInText(quote: string, rawText: string): [number, number] | null {
  if (!quote || !rawText) return null;

  // Normalize whitespace (including newlines) for comparison
  const normalizedQuote = quote.replace(/[\s\n\r]+/g, " ").trim().toLowerCase();
  const normalizedText = rawText.replace(/[\s\n\r]+/g, " ").toLowerCase();

  // Try exact normalized match first
  let index = normalizedText.indexOf(normalizedQuote);
  if (index !== -1) {
    return [index, index + normalizedQuote.length];
  }

  // Try with punctuation removed
  const cleanQuote = normalizedQuote.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const cleanText = normalizedText.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ");
  index = cleanText.indexOf(cleanQuote);
  if (index !== -1) {
    return [index, index + cleanQuote.length];
  }

  // Try matching key tokens (for partial matches with variations)
  const tokens = cleanQuote.split(/\s+/).filter((w) => w.length >= 2);
  if (tokens.length >= 2) {
    // Build flexible regex pattern: word.*?word.*?word
    const escapedTokens = tokens.slice(0, 6).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = escapedTokens.join("[\\s\\S]{0,20}");
    try {
      const regex = new RegExp(pattern, "i");
      const match = cleanText.match(regex);
      if (match && match.index !== undefined) {
        return [match.index, match.index + match[0].length];
      }
    } catch {
      // Regex failed, skip this approach
    }
  }

  // Last resort: find longest matching substring
  if (tokens.length >= 1) {
    // Try to find the most significant token (longest word or number)
    const significantTokens = tokens.filter((t) => t.length >= 3 || /^\d+/.test(t));
    for (const token of significantTokens) {
      const tokenIndex = cleanText.indexOf(token);
      if (tokenIndex !== -1) {
        // Found at least one key token - search around it
        const contextStart = Math.max(0, tokenIndex - 50);
        const contextEnd = Math.min(cleanText.length, tokenIndex + 100);
        return [contextStart, contextEnd];
      }
    }
  }

  return null;
}

/**
 * Extract quotes from Gemini's response and verify against raw text
 */
function extractAndVerifyCitations(
  answer: string,
  document: DocumentMatch
): Citation[] {
  const citations: Citation[] = [];

  // Extract quoted text (text between quotation marks)
  const quotePatterns = [
    /"([^"]+)"/g, // Double quotes
    /'([^']+)'/g, // Single quotes (less common)
    /「([^」]+)」/g, // CJK quotes
  ];

  const quotes: string[] = [];
  for (const pattern of quotePatterns) {
    let match;
    while ((match = pattern.exec(answer)) !== null) {
      let quote = match[1].trim();
      // Unescape dollar signs that Gemini may have escaped (e.g., \$105 -> $105)
      quote = quote.replace(/\\(\$)/g, "$1");
      // Fix corrupted dollar signs from OCR (e.g., \105 -> $105)
      // The OCR sometimes drops $ and leaves just \, so \105 should be $105
      quote = quote.replace(/\\(\d)/g, "$$$1");
      // Filter out very short quotes or obvious non-citations
      if (quote.length > 5 && !quote.match(/^(yes|no|the|and|but|or)$/i)) {
        quotes.push(quote);
      }
    }
  }

  // Verify each quote against raw text
  for (const quote of quotes) {
    const span = findSpanInText(quote, document.raw_text || "");
    const verified = span !== null;

    citations.push({
      docId: document.id,
      fileName: document.file_name,
      span: span || [0, 0],
      excerpt: quote,
      verified,
    });
  }

  return citations;
}

/**
 * Main function: Answer a single document question with verifiable citations
 */
export async function answerSingleDocumentQuestion(
  query: string,
  slots: Slots,
  options?: { mode?: AssistantMode }
): Promise<QAResult> {
  console.log(`[SingleQA] Processing: "${query}"`);
  const mode: AssistantMode = options?.mode ?? "owner";

  // Step 1: Find target document
  const findResult = await findTargetDocument(slots);

  if (!findResult.success) {
    // Build candidates list for multiple_matches
    let candidates: CandidateDocument[] | undefined;
    if (findResult.error === "multiple_matches" && findResult.matches) {
      candidates = findResult.matches.map((doc) => ({
        id: doc.id,
        fileName: doc.file_name,
        summary: formatDocSummary(doc),
      }));
    }

    return {
      answer: null,
      citations: [],
      confidence: "low",
      allCitationsVerified: false,
      error: findResult.error,
      clarifyingQuestion: findResult.clarifyingQuestion,
      candidates,
    };
  }

  const document = findResult.document;
  console.log(`[SingleQA] Found document: ${document.file_name}`);

  // Step 2: Generate answer with Gemini
  let answerResult: { answer: string; rawResponse: string };
  try {
    answerResult = await generateAnswerWithCitations(query, document, mode);
  } catch (error) {
    return {
      answer: null,
      citations: [],
      confidence: "low",
      allCitationsVerified: false,
      documentUsed: {
        id: document.id,
        fileName: document.file_name,
        documentType: document.document_type,
      },
      error: "insufficient_info",
    };
  }

  // Step 3: Extract and verify citations
  const citations = extractAndVerifyCitations(answerResult.answer, document);
  console.log(`[SingleQA] Found ${citations.length} citations, verifying...`);

  // Step 4: Calculate confidence based on verification
  const verifiedCount = citations.filter((c) => c.verified).length;
  const allCitationsVerified = citations.length > 0 && verifiedCount === citations.length;

  let confidence: ConfidenceLevel;
  if (allCitationsVerified && citations.length > 0) {
    confidence = "high";
  } else if (verifiedCount > 0) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  console.log(`[SingleQA] Verified: ${verifiedCount}/${citations.length}, confidence: ${confidence}`);

  return {
    answer: answerResult.answer,
    citations,
    confidence,
    allCitationsVerified,
    documentUsed: {
      id: document.id,
      fileName: document.file_name,
      documentType: document.document_type,
    },
  };
}
