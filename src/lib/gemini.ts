// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Export specific models
// FIX: Use 'gemini-1.5-flash' for chat. It is the most stable and fastest.
export const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); 

// FIX: Use 'gemini-1.5-flash' for vision too if pro fails, or try 'gemini-1.5-pro-latest'
export const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
