// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Export specific models
// Using 'gemini-pro' - the most basic and universally available model
// If this still fails, the API key itself may have issues

export const chatModel = genAI.getGenerativeModel({ model: "gemini-pro" }); 
export const visionModel = genAI.getGenerativeModel({ model: "gemini-pro" });
