/**
 * Shared Gemini Client
 *
 * Provides a singleton model instance and common utilities
 * to avoid duplication across extractor files.
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

let modelInstance: GenerativeModel | null = null;

/**
 * Get the Gemini model instance (singleton)
 */
export function getGeminiModel(): GenerativeModel {
  if (!modelInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    modelInstance = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}
