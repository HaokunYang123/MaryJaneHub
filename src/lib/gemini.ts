// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Export specific models
export const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Fast, good for chat
export const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Smarter, good for invoices
