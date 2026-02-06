/**
 * Shared Gemini Client
 *
 * Provides a singleton model instance and common utilities
 * to avoid duplication across extractor files.
 */

import {
  GoogleGenAI,
  type GenerateContentResponse,
} from "@google/genai";
import type { GeminiGenerateContentRequest, GeminiModel } from "./call";

let modelInstance: GeminiModel | null = null;
let genAiInstance: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (genAiInstance) return genAiInstance;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }

  genAiInstance = new GoogleGenAI({
    apiKey,
    ...(process.env.GEMINI_API_VERSION
      ? { apiVersion: process.env.GEMINI_API_VERSION }
      : {}),
  });

  return genAiInstance;
}

function getModelName(): string {
  return process.env.GEMINI_MODEL || "gemini-2.5-flash";
}

/**
 * Get the Gemini model instance (singleton)
 */
export function getGeminiModel(): GeminiModel {
  if (!modelInstance) {
    const client = getGeminiClient();
    const modelName = getModelName();

    modelInstance = {
      async generateContent(
        input: GeminiGenerateContentRequest,
        options?: { signal?: AbortSignal }
      ): Promise<{ response: GenerateContentResponse }> {
        const config = {
          ...(input.config || {}),
          ...(options?.signal ? { abortSignal: options.signal } : {}),
        };

        const response = await client.models.generateContent({
          model: modelName,
          contents: input.contents,
          config,
        });

        return { response };
      },
    };
  }
  return modelInstance;
}

/**
 * Clean JSON response from Gemini
 *
 * Removes markdown code block wrappers that Gemini sometimes adds
 */
export function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^\uFEFF/, "");

  const fenceStart = cleaned.indexOf("```");
  if (fenceStart !== -1) {
    const fenceEnd = cleaned.lastIndexOf("```");
    if (fenceEnd > fenceStart) {
      cleaned = cleaned.slice(fenceStart + 3, fenceEnd);
      if (cleaned.startsWith("json")) {
        cleaned = cleaned.slice(4);
      }
    }
  } else if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }

  return cleaned.trim();
}

function extractJsonSnippet(raw: string): string {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1);
  }
  return raw;
}

export function parseJsonResponse<T>(raw: string): T {
  const cleaned = cleanJsonResponse(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const snippet = extractJsonSnippet(cleaned);
    if (snippet !== cleaned) {
      try {
        return JSON.parse(snippet) as T;
      } catch {
        // fall through
      }
    }
    const preview = cleaned.slice(0, 200);
    throw new Error(`Invalid JSON response: ${preview}`);
  }
}
