// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Export specific models
// Using 'gemini-2.5-flash' - confirmed available via curl

export const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
export const visionModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
