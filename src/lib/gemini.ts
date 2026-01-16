// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the API with your key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Tier 1 - Classification (Fast/Cheap for 5,000 files)
export const classifierModel = genAI.getGenerativeModel({
    model: process.env.TIER1_MODEL || "gemini-2.0-flash-lite"
});

// Tier 2 - Deep Extraction (Gemini 2.5 Flash)
export const deepExtractionModel = genAI.getGenerativeModel({
    model: process.env.TIER2_MODEL || "gemini-2.5-flash"
});

// Tier 3 - Expert Analysis (Gemini 2.5 Pro) - For low-confidence documents
export const expertAnalysisModel = genAI.getGenerativeModel({
    model: process.env.TIER3_MODEL || "gemini-2.5-pro"
});

// Legacy exports for backward compatibility
export const chatModel = deepExtractionModel;
export const visionModel = deepExtractionModel;
