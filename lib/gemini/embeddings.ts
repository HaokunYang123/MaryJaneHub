/**
 * Gemini Embeddings Client
 *
 * Uses Gemini's text-embedding-004 model for generating embeddings.
 * Output dimension: 768
 */

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
