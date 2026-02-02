import type { GenerativeModel } from "@google/generative-ai";

export type GeminiTimeoutError = Error & { code: "GEMINI_TIMEOUT" };

const DEFAULT_TIMEOUT_MS = 45000;

function resolveTimeoutMs(): number {
  const raw = process.env.GEMINI_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return parsed;
}

function createTimeoutError(): GeminiTimeoutError {
  const error = new Error("Gemini request timed out") as GeminiTimeoutError;
  error.code = "GEMINI_TIMEOUT";
  return error;
}

export async function generateContentWithTimeout(
  model: GenerativeModel,
  prompt: string
) {
  const timeoutMs = resolveTimeoutMs();
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
      input: string,
      options?: { signal?: AbortSignal }
    ) => Promise<unknown>;
  }).generateContent(prompt, { signal: controller.signal });

  try {
    return await Promise.race([modelCall, timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw timeoutError;
    }
    throw error;
  }
}
