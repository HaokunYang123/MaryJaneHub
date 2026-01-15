// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Export specific models
// We are using 'gemini-1.5-flash' for EVERYTHING now because it is 
// the most stable, fast, and supports both text (Chat) and images (Invoices).

export const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 
export const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
