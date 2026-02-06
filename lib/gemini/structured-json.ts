import type {
  GenerateContentConfig,
  GenerateContentResponse,
  Schema,
} from "@google/genai";
import { parseJsonResponse } from "./client";
import {
  buildJsonRequest,
  generateContentWithTimeout,
  type GeminiModel,
} from "./call";

export type StructuredJsonAttempt = {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  promptSuffix?: string;
};

export type StructuredJsonDiagnostics = {
  finishReason?: string;
  finishMessage?: string;
  promptBlockReason?: string;
  promptBlockReasonMessage?: string;
  rawResponse?: string;
};

export class StructuredJsonError extends Error {
  readonly diagnostics?: StructuredJsonDiagnostics;

  constructor(message: string, diagnostics?: StructuredJsonDiagnostics) {
    super(message);
    this.name = "StructuredJsonError";
    this.diagnostics = diagnostics;
  }
}

type GenerateStructuredJsonOptions<T> = {
  model: GeminiModel;
  prompt: string;
  schema: Schema;
  attempts: StructuredJsonAttempt[];
  parser?: (rawResponse: string) => T;
  label: string;
};

type GenerateStructuredJsonResult<T> = {
  parsed: T;
  rawResponse: string;
  diagnostics: StructuredJsonDiagnostics;
};

const NON_RETRYABLE_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "LANGUAGE",
  "MALFORMED_FUNCTION_CALL",
]);

function extractResponseText(
  response: GenerateContentResponse
): StructuredJsonDiagnostics {
  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const finishMessage = candidate?.finishMessage;
  const promptBlockReason = response.promptFeedback?.blockReason;
  const promptBlockReasonMessage = response.promptFeedback?.blockReasonMessage;

  const parts = candidate?.content?.parts ?? [];
  const fromParts = parts
    .map((part) => ("text" in part ? part.text : ""))
    .filter((partText): partText is string => typeof partText === "string")
    .join("")
    .trim();

  if (fromParts.length > 0) {
    return {
      finishReason,
      finishMessage,
      promptBlockReason,
      promptBlockReasonMessage,
      rawResponse: fromParts,
    };
  }

  try {
    const text = (response.text ?? "").trim();
    return {
      finishReason,
      finishMessage,
      promptBlockReason,
      promptBlockReasonMessage,
      rawResponse: text,
    };
  } catch {
    return {
      finishReason,
      finishMessage,
      promptBlockReason,
      promptBlockReasonMessage,
      rawResponse: "",
    };
  }
}

function formatDiagnostics(label: string, diagnostics: StructuredJsonDiagnostics): string {
  const parts = [label];
  if (diagnostics.finishReason) parts.push(`finishReason=${diagnostics.finishReason}`);
  if (diagnostics.promptBlockReason) parts.push(`blockReason=${diagnostics.promptBlockReason}`);
  if (diagnostics.finishMessage) parts.push(`finishMessage=${diagnostics.finishMessage}`);
  if (diagnostics.promptBlockReasonMessage) {
    parts.push(`blockMessage=${diagnostics.promptBlockReasonMessage}`);
  }
  return parts.join(" | ");
}

function resolveParser<T>(parser?: (rawResponse: string) => T): (rawResponse: string) => T {
  if (parser) return parser;
  return (rawResponse: string) => parseJsonResponse<T>(rawResponse);
}

export async function generateStructuredJson<T>(
  options: GenerateStructuredJsonOptions<T>
): Promise<GenerateStructuredJsonResult<T>> {
  const parser = resolveParser(options.parser);
  let lastError: Error | undefined;
  let lastDiagnostics: StructuredJsonDiagnostics | undefined;

  for (let index = 0; index < options.attempts.length; index++) {
    const attempt = options.attempts[index];
    const prompt = attempt.promptSuffix
      ? `${options.prompt}\n\n${attempt.promptSuffix}`
      : options.prompt;

    const generationConfig: Partial<GenerateContentConfig> = {
      temperature: attempt.temperature,
      maxOutputTokens: attempt.maxOutputTokens,
      topP: attempt.topP,
      topK: attempt.topK,
    };

    try {
      const request = buildJsonRequest(prompt, options.schema, generationConfig);
      const result = (await generateContentWithTimeout(options.model, request)) as {
        response: GenerateContentResponse;
      };
      const diagnostics = extractResponseText(result.response);
      lastDiagnostics = diagnostics;
      const rawResponse = diagnostics.rawResponse?.trim() ?? "";

      if (!rawResponse) {
        const emptyError = new StructuredJsonError(
          `${formatDiagnostics(options.label, diagnostics)} | empty response`,
          diagnostics
        );
        lastError = emptyError;
        continue;
      }

      try {
        const parsed = parser(rawResponse);
        return {
          parsed,
          rawResponse,
          diagnostics,
        };
      } catch (parseError) {
        const parseMessage =
          parseError instanceof Error ? parseError.message : String(parseError);
        const error = new StructuredJsonError(
          `${formatDiagnostics(options.label, diagnostics)} | parseError=${parseMessage}`,
          diagnostics
        );
        lastError = error;

        if (
          diagnostics.finishReason &&
          NON_RETRYABLE_FINISH_REASONS.has(diagnostics.finishReason)
        ) {
          break;
        }

        continue;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  if (lastError instanceof StructuredJsonError) {
    throw lastError;
  }

  if (lastError) {
    throw new StructuredJsonError(lastError.message, lastDiagnostics);
  }

  throw new StructuredJsonError(
    `${options.label} failed with no result`,
    lastDiagnostics
  );
}
