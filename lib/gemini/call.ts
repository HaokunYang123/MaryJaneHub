import type {
  GenerativeModel,
  GenerateContentRequest,
  GenerationConfig,
  ResponseSchema,
} from "@google/generative-ai";

export type GeminiTimeoutError = Error & { code: "GEMINI_TIMEOUT" };

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_RETRY_MAX = 3;
const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_RETRY_MAX_MS = 10000;

function resolveTimeoutMs(): number {
  const raw = process.env.GEMINI_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function resolveRetryMax(): number {
  const raw = process.env.GEMINI_RETRY_MAX;
  if (!raw) return DEFAULT_RETRY_MAX;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETRY_MAX;
  return parsed;
}

function resolveRetryBaseMs(): number {
  const raw = process.env.GEMINI_RETRY_BASE_MS;
  if (!raw) return DEFAULT_RETRY_BASE_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RETRY_BASE_MS;
  return parsed;
}

function resolveRetryMaxMs(): number {
  const raw = process.env.GEMINI_RETRY_MAX_MS;
  if (!raw) return DEFAULT_RETRY_MAX_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RETRY_MAX_MS;
  return parsed;
}

function createTimeoutError(): GeminiTimeoutError {
  const error = new Error("Gemini request timed out") as GeminiTimeoutError;
  error.code = "GEMINI_TIMEOUT";
  return error;
}

function isRetryableGeminiError(error: unknown): boolean {
  if ((error as GeminiTimeoutError)?.code === "GEMINI_TIMEOUT") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /(429|Too\s*Many\s*Requests|503|Service\s*Unavailable|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND)/i.test(message);
}

function backoffDelayMs(attempt: number): number {
  const base = resolveRetryBaseMs();
  const max = resolveRetryMaxMs();
  const jitter = Math.random() * base;
  const delay = base * Math.pow(2, attempt) + jitter;
  return Math.min(delay, max);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateContentWithTimeout(
  model: GenerativeModel,
  promptOrRequest: string | GenerateContentRequest
) {
  const retries = resolveRetryMax();
  const timeoutMs = resolveTimeoutMs();

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutError = createTimeoutError();

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, timeoutMs);
      controller.signal.addEventListener(
        "abort",
        () => clearTimeout(timeoutId),
        { once: true }
      );
    });

    const modelCall = (model as unknown as {
      generateContent: (
        input: string | GenerateContentRequest,
        options?: { signal?: AbortSignal }
      ) => Promise<unknown>;
    }).generateContent(promptOrRequest, { signal: controller.signal });

    try {
      return await Promise.race([modelCall, timeoutPromise]);
    } catch (error) {
      const resolvedError = controller.signal.aborted ? timeoutError : error;
      const shouldRetry = attempt < retries && isRetryableGeminiError(resolvedError);
      if (!shouldRetry) {
        throw resolvedError;
      }
      const delay = backoffDelayMs(attempt);
      console.warn(`Gemini request failed, retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }

  throw new Error("Gemini request failed after retries");
}

export const JSON_RESPONSE_MIME = "application/json";

export function buildJsonRequest(
  prompt: string,
  schema: ResponseSchema,
  overrides: Partial<GenerationConfig> = {}
): GenerateContentRequest {
  return {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: JSON_RESPONSE_MIME,
      responseSchema: schema,
      ...overrides,
    },
  };
}
