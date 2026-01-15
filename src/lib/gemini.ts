// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Support both API key variable names
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
  console.warn('WARNING: No Gemini API key found. Set GEMINI_API_KEY in your .env file.');
}

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(apiKey || '');

// Export specific models
export const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Fast, good for chat
export const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Smarter, good for invoices

// Export the genAI instance if needed elsewhere
export { genAI };
