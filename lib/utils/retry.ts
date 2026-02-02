export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
};

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true,
};

const RETRYABLE_NETWORK_CODES = new Set(["ECONNRESET", "ETIMEDOUT"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorStatus(error: unknown): number | undefined {
  const err = error as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown; statusCode?: unknown };
  };

  if (typeof err?.code === "number") return err.code;
  if (typeof err?.status === "number") return err.status;
  if (typeof err?.statusCode === "number") return err.statusCode;
  if (typeof err?.response?.status === "number") return err.response.status;
  if (typeof err?.response?.statusCode === "number") return err.response.statusCode;

  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  const err = error as { code?: unknown; cause?: { code?: unknown } };
  if (typeof err?.code === "string") return err.code;
  if (typeof err?.cause?.code === "string") return err.cause.code;
  return undefined;
}

function isRetryableError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status < 600) return true;

  const code = getErrorCode(error);
  if (code && RETRYABLE_NETWORK_CODES.has(code)) return true;

  return false;
}

function computeDelayMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  if (!jitter) return exponential;
  const jitterAmount = Math.floor(Math.random() * Math.max(1, baseDelayMs));
  return Math.min(maxDelayMs, exponential + jitterAmount);
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries, baseDelayMs, maxDelayMs, jitter } = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableError(error)) {
        throw error;
      }
      const delayMs = computeDelayMs(attempt, baseDelayMs, maxDelayMs, jitter);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
