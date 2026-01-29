/**
 * Gemini Embeddings Client
 *
 * Uses Gemini's text-embedding-004 model for generating embeddings.
 * Output dimension: 768
 */

import type { DocumentExtraction } from "./extract-document";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
const OUTPUT_DIMENSIONALITY = 768;

// Max input tokens for text-embedding-004 is 2048
// Truncate to ~8000 chars to be safe (rough estimate: 4 chars per token)
const MAX_TEXT_LENGTH = 8000;

export interface EmbeddingResult {
  success: true;
  embedding: number[];
  truncated: boolean;
  processingTimeMs: number;
}

export interface EmbeddingError {
  success: false;
  error: string;
}

export type EmbeddingResponse = EmbeddingResult | EmbeddingError;

/**
 * Truncate text to fit within token limits
 */
function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_LENGTH) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, MAX_TEXT_LENGTH), truncated: true };
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate embedding for text using Gemini text-embedding-004
 *
 * @param text - Text to generate embedding for
 * @param retries - Number of retries for rate limiting (default: 3)
 * @returns Promise resolving to 768-dimensional embedding vector
 */
export async function generateEmbedding(
  text: string,
  retries = 3
): Promise<EmbeddingResponse> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "GEMINI_API_KEY environment variable is not set",
    };
  }

  if (!text || text.trim().length === 0) {
    return {
      success: false,
      error: "Text cannot be empty",
    };
  }

  const { text: processedText, truncated } = truncateText(text.trim());
  const startTime = Date.now();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${EMBEDDING_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: {
            parts: [{ text: processedText }],
          },
          outputDimensionality: OUTPUT_DIMENSIONALITY,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        // Handle rate limiting with exponential backoff
        if (response.status === 429 && attempt < retries) {
          const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`Rate limited, retrying in ${Math.round(backoffMs)}ms...`);
          await sleep(backoffMs);
          continue;
        }

        return {
          success: false,
          error: `Gemini API error (${response.status}): ${errorBody}`,
        };
      }

      const data = await response.json();

      if (!data.embedding?.values || !Array.isArray(data.embedding.values)) {
        return {
          success: false,
          error: "Invalid response format from Gemini API",
        };
      }

      const embedding = data.embedding.values as number[];

      // Verify dimension
      if (embedding.length !== 768) {
        return {
          success: false,
          error: `Unexpected embedding dimension: ${embedding.length} (expected 768)`,
        };
      }

      return {
        success: true,
        embedding,
        truncated,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      if (attempt < retries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`Request failed, retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
        continue;
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        error: `Failed to generate embedding: ${errorMessage}`,
      };
    }
  }

  return {
    success: false,
    error: "Max retries exceeded",
  };
}

/**
 * Generate embeddings for multiple texts in batch
 * Processes sequentially with rate limiting to avoid 429 errors
 *
 * @param texts - Array of texts to generate embeddings for
 * @param delayMs - Delay between requests in milliseconds (default: 100)
 * @returns Promise resolving to array of embedding results
 */
export async function generateEmbeddingsBatch(
  texts: string[],
  delayMs = 100
): Promise<EmbeddingResponse[]> {
  const results: EmbeddingResponse[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (i > 0) {
      await sleep(delayMs);
    }
    const result = await generateEmbedding(texts[i]);
    results.push(result);
  }

  return results;
}

/**
 * Generate rich embedding text from document data
 *
 * Combines structured extraction data with raw text for better semantic search.
 * Structured fields are prepended to help the embedding capture key entities.
 *
 * @param document - Document with type, raw_text, and extraction
 * @returns Enriched text optimized for embedding generation
 */
export function generateEmbeddingText(document: {
  document_type: string;
  raw_text: string | null;
  extraction: DocumentExtraction | Record<string, unknown>;
}): string {
  const parts: string[] = [];
  const extraction = document.extraction as DocumentExtraction;
  const data = extraction?.data || {};

  // Document type label
  const typeLabels: Record<string, string> = {
    invoice: "Invoice",
    receipt: "Receipt",
    bank_statement: "Bank Statement",
    contract: "Contract",
    tax_form: "Tax Form",
    correspondence: "Correspondence",
    other: "Document",
  };
  parts.push(`Type: ${typeLabels[document.document_type] || "Document"}`);

  // Type-specific structured fields
  switch (document.document_type) {
    case "invoice": {
      const d = data as {
        vendor?: string | null;
        invoice_date?: string | null;
        total?: number | null;
        line_items?: Array<{ description?: string }>;
      };
      if (d.vendor) parts.push(`Vendor: ${d.vendor}`);
      if (d.invoice_date) parts.push(`Date: ${d.invoice_date}`);
      if (d.total != null) parts.push(`Total: $${d.total.toFixed(2)}`);
      if (d.line_items?.length) {
        const items = d.line_items
          .slice(0, 10)
          .map((i) => i.description)
          .filter(Boolean)
          .join(", ");
        if (items) parts.push(`Items: ${items}`);
      }
      break;
    }

    case "receipt": {
      const d = data as {
        merchant_name?: string | null;
        date?: string | null;
        total?: number | null;
        items?: Array<{ description?: string }>;
      };
      if (d.merchant_name) parts.push(`Merchant: ${d.merchant_name}`);
      if (d.date) parts.push(`Date: ${d.date}`);
      if (d.total != null) parts.push(`Total: $${d.total.toFixed(2)}`);
      if (d.items?.length) {
        const items = d.items
          .slice(0, 10)
          .map((i) => i.description)
          .filter(Boolean)
          .join(", ");
        if (items) parts.push(`Items: ${items}`);
      }
      break;
    }

    case "bank_statement": {
      const d = data as {
        bank_name?: string | null;
        statement_period_start?: string | null;
        statement_period_end?: string | null;
        closing_balance?: number | null;
      };
      if (d.bank_name) parts.push(`Bank: ${d.bank_name}`);
      if (d.statement_period_start && d.statement_period_end) {
        parts.push(`Period: ${d.statement_period_start} to ${d.statement_period_end}`);
      }
      if (d.closing_balance != null) parts.push(`Balance: $${d.closing_balance.toFixed(2)}`);
      break;
    }

    case "contract": {
      const d = data as {
        contract_type?: string | null;
        parties?: Array<{ name?: string }>;
        effective_date?: string | null;
        value?: number | null;
      };
      if (d.contract_type) parts.push(`Contract Type: ${d.contract_type}`);
      if (d.parties?.length) {
        const partyNames = d.parties.map((p) => p.name).filter(Boolean);
        if (partyNames.length) parts.push(`Parties: ${partyNames.join(", ")}`);
      }
      if (d.effective_date) parts.push(`Date: ${d.effective_date}`);
      if (d.value != null) parts.push(`Value: $${d.value.toFixed(2)}`);
      break;
    }

    case "tax_form": {
      const d = data as {
        form_type?: string | null;
        tax_year?: number | null;
        entity_name?: string | null;
        total_income?: number | null;
      };
      if (d.form_type) parts.push(`Form: ${d.form_type}`);
      if (d.tax_year) parts.push(`Tax Year: ${d.tax_year}`);
      if (d.entity_name) parts.push(`Entity: ${d.entity_name}`);
      if (d.total_income != null) parts.push(`Income: $${d.total_income.toFixed(2)}`);
      break;
    }

    case "correspondence": {
      const d = data as {
        sender?: string | null;
        sender_organization?: string | null;
        date?: string | null;
        subject?: string | null;
      };
      if (d.sender_organization) parts.push(`From: ${d.sender_organization}`);
      else if (d.sender) parts.push(`From: ${d.sender}`);
      if (d.date) parts.push(`Date: ${d.date}`);
      if (d.subject) parts.push(`Subject: ${d.subject}`);
      break;
    }

    default: {
      // Generic fallback for "other" type
      const d = data as {
        vendor?: string | null;
        invoice_date?: string | null;
        total?: number | null;
      };
      if (d.vendor) parts.push(`Vendor: ${d.vendor}`);
      if (d.invoice_date) parts.push(`Date: ${d.invoice_date}`);
      if (d.total != null) parts.push(`Total: $${d.total.toFixed(2)}`);
    }
  }

  // Add truncated raw text (max 800 chars to balance structure vs content)
  const rawText = document.raw_text?.trim().slice(0, 800) || "";
  if (rawText) {
    parts.push("");
    parts.push(rawText);
  }

  return parts.join("\n");
}
