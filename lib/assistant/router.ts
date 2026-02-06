/**
 * Smart Assistant Router
 *
 * Determines user intent and extracts structured slots from natural language queries.
 * Uses rule-based matching first, with Gemini model fallback for ambiguous cases.
 */

import { parseQuery, type ParsedQuery } from "../search/parse-query";
import { getGeminiModel } from "../gemini/client";
import { generateContentWithTimeout } from "../gemini/call";
import { matchRules, inferIntentFromSlots, isQuestion, isFragmentFollowUp } from "./rules";
import type {
  Intent,
  Slots,
  RouterResult,
  ConfidenceLevel,
  ClarificationRequirement,
  REQUIRED_SLOTS,
  RECOMMENDED_SLOTS,
} from "./types";

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Slot completeness scores
 */
const SLOT_COMPLETENESS = {
  ALL_REQUIRED: 1.0,
  MISSING_OPTIONAL: 0.8,
  MISSING_REQUIRED: 0.5,
};

/**
 * Convert ParsedQuery to Slots
 */
function parsedQueryToSlots(parsed: ParsedQuery): Slots {
  return {
    date: parsed.date,
    year: parsed.year,
    month: parsed.month,
    amount: parsed.amount,
    documentType: parsed.documentType,
    vendor: parsed.vendor,
    semanticText: parsed.semanticText,
  };
}

/**
 * Get confidence level from score
 */
function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 0.85) return "high";
  if (score >= 0.7) return "medium";
  return "low";
}

/**
 * Calculate slot completeness score per intent
 * Returns { score, hasRequiredMissing, missingSlots }
 */
function calculateSlotCompleteness(
  intent: Intent,
  slots: Slots
): { score: number; hasRequiredMissing: boolean; missingSlots: string[] } {
  const missingSlots: string[] = [];
  let hasRequiredMissing = false;

  const hasDateRange = !!(slots.year || slots.date || slots.month);
  const hasDocType = !!slots.documentType;
  const hasVendor = !!slots.vendor;
  const hasSemanticContent = slots.semanticText.length >= 5;
  const hasTopic = hasVendor || hasSemanticContent;

  switch (intent) {
    case "sum":
      // sum: date_range OR document_type is REQUIRED
      if (!hasDateRange && !hasDocType) {
        hasRequiredMissing = true;
        missingSlots.push("date_range or document_type");
      }
      break;

    case "single_qa":
      // single_qa: document_reference (vendor/date/amount) is REQUIRED
      if (!hasVendor && !slots.date && !slots.amount && !hasSemanticContent) {
        hasRequiredMissing = true;
        missingSlots.push("document_reference");
      }
      break;

    case "search":
      // search: any filter is OPTIONAL (but warn if none)
      const hasAnyFilter = hasDocType || hasVendor || hasDateRange || slots.amount || hasSemanticContent;
      if (!hasAnyFilter) {
        missingSlots.push("filter");
        // Not required, but note it's missing
      }
      break;

    case "rag":
      // rag: topic/entity is REQUIRED
      if (!hasTopic) {
        hasRequiredMissing = true;
        missingSlots.push("topic_or_entity");
      }
      break;
  }

  // Calculate score
  let score: number;
  if (hasRequiredMissing) {
    score = SLOT_COMPLETENESS.MISSING_REQUIRED;
  } else if (missingSlots.length > 0) {
    score = SLOT_COMPLETENESS.MISSING_OPTIONAL;
  } else {
    score = SLOT_COMPLETENESS.ALL_REQUIRED;
  }

  return { score, hasRequiredMissing, missingSlots };
}

/**
 * Get clarifying question based on intent and missing slots
 */
function getClarifyingQuestion(intent: Intent, missingSlots: string[]): string | undefined {
  if (missingSlots.length === 0) return undefined;

  switch (intent) {
    case "sum":
      if (missingSlots.includes("date_range or document_type")) {
        return "For what time period or document type would you like the total? (e.g., \"2024 invoices\", \"all receipts\")";
      }
      break;

    case "single_qa":
      if (missingSlots.includes("document_reference")) {
        return "Which document or vendor are you asking about?";
      }
      break;

    case "search":
      if (missingSlots.includes("filter")) {
        return "Could you be more specific? Try adding a vendor name, date, or document type.";
      }
      break;

    case "rag":
      if (missingSlots.includes("topic_or_entity")) {
        return "What would you like me to tell you about? Please specify a vendor, topic, or time period.";
      }
      break;
  }

  return "Could you provide more details?";
}

/**
 * Classify intent using Gemini model (fallback)
 */
async function classifyWithModel(
  query: string,
  slots: Slots
): Promise<{ intent: Intent; confidence: number; reasoning: string }> {
  const model = getGeminiModel();

  const prompt = `You are an intent classifier for a document management assistant.

Classify the following user query into ONE of these intents:
- search: User wants to find or list documents (e.g., "find all FedEx invoices", "show me receipts from 2024")
- single_qa: User is asking about a specific field of a document (e.g., "what's the total for invoice #123?")
- sum: User wants numerical aggregation - totals, counts, averages (e.g., "how much did we spend in 2024?")
- rag: User wants a synthesized answer across multiple documents (e.g., "tell me about our relationship with Bega")

Query: "${query}"

Extracted info:
- Document type: ${slots.documentType || "not specified"}
- Vendor/company: ${slots.vendor || slots.semanticText || "not specified"}
- Date/Year: ${slots.year || slots.date || "not specified"}
- Amount: ${slots.amount || "not specified"}

  Respond with JSON only:
{
  "intent": "search" | "single_qa" | "sum" | "rag",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`;

  try {
    const result = (await generateContentWithTimeout(model, prompt)) as {
      response: { text?: string | (() => string) };
    };
    const responseText =
      typeof result.response.text === "function"
        ? result.response.text()
        : (result.response.text ?? "");

    // Clean and parse JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: parsed.intent as Intent,
        confidence: Math.min(1.0, Math.max(0, parsed.confidence)),
        reasoning: parsed.reasoning || "Classified by model",
      };
    }
  } catch (error) {
    console.error("[Router] Model classification failed:", error);
  }

  // Fallback if model fails
  return {
    intent: "search",
    confidence: 0.5,
    reasoning: "Model classification failed, defaulting to search",
  };
}

/**
 * Main router function
 *
 * Analyzes a user query and determines:
 * 1. Intent (search, single_qa, sum, rag)
 * 2. Extracted slots (dates, amounts, vendors, etc.)
 * 3. Confidence level
 * 4. Whether clarification is needed
 */
export async function routeQuery(query: string): Promise<RouterResult> {
  console.log(`[Router] Processing: "${query}"`);

  // Step 1: Extract slots using parseQuery
  const parsed = parseQuery(query);
  const slots = parsedQueryToSlots(parsed);
  console.log(`[Router] Slots: type=${slots.documentType}, vendor=${slots.vendor}, year=${slots.year}, text="${slots.semanticText}"`);

  // Step 2: Try rule-based matching first
  let ruleMatch = matchRules(query, slots);
  let usedModel = false;

  // Step 3: If no rule match, try to infer from slots
  if (!ruleMatch) {
    if (isFragmentFollowUp(query)) {
      ruleMatch = {
        intent: "search",
        confidence: 0.4,
        reasoning: "Fragment follow-up, prefer clarification",
      };
      console.log("[Router] Fragment follow-up detected");
    } else {
      ruleMatch = inferIntentFromSlots(slots);
      console.log(`[Router] No rule match, inferred: ${ruleMatch?.intent || "none"}`);
    }
  }

  // Step 4: If still no match or low confidence, use model
  let intent: Intent;
  let confidence: number;
  let reasoning: string;

  if (!ruleMatch || ruleMatch.confidence < CONFIDENCE_THRESHOLD) {
    console.log(`[Router] Using model fallback (rule confidence: ${ruleMatch?.confidence || 0})`);
    const modelResult = await classifyWithModel(query, slots);
    intent = modelResult.intent;
    confidence = modelResult.confidence;
    reasoning = modelResult.reasoning;
    usedModel = true;
  } else {
    intent = ruleMatch.intent;
    confidence = ruleMatch.confidence;
    reasoning = ruleMatch.reasoning;

    // Merge any additional slots from rule matching
    if (ruleMatch.additionalSlots) {
      Object.assign(slots, ruleMatch.additionalSlots);
    }
  }

  console.log(`[Router] Intent confidence: ${intent} (${(confidence * 100).toFixed(0)}%)`);

  // Step 5: Calculate slot completeness and adjust final confidence
  const slotCompleteness = calculateSlotCompleteness(intent, slots);
  const finalConfidence = Math.min(confidence, slotCompleteness.score);

  console.log(`[Router] Slot completeness: ${(slotCompleteness.score * 100).toFixed(0)}%, final: ${(finalConfidence * 100).toFixed(0)}%`);

  // Step 6: Determine if clarification is needed
  const needsClarification = finalConfidence < CONFIDENCE_THRESHOLD;
  let clarifyingQuestion: string | undefined;

  if (needsClarification) {
    clarifyingQuestion = getClarifyingQuestion(intent, slotCompleteness.missingSlots);
    if (!clarifyingQuestion) {
      clarifyingQuestion = "I'm not quite sure what you're looking for. Could you rephrase or add more details?";
    }
  }

  return {
    intent,
    slots,
    confidence: getConfidenceLevel(finalConfidence),
    confidenceScore: finalConfidence,
    needsClarification,
    clarifyingQuestion,
    reasoning,
    usedModel,
    originalQuery: query,
  };
}

/**
 * Quick classification without model fallback
 * Useful for testing or when low latency is critical
 */
export function routeQuerySync(query: string): RouterResult {
  const parsed = parseQuery(query);
  const slots = parsedQueryToSlots(parsed);

  let ruleMatch = matchRules(query, slots);
  if (!ruleMatch) {
    if (isFragmentFollowUp(query)) {
      ruleMatch = {
        intent: "search",
        confidence: 0.4,
        reasoning: "Fragment follow-up, prefer clarification",
      };
    } else {
      ruleMatch = inferIntentFromSlots(slots);
    }
  }

  const intent = ruleMatch?.intent || "search";
  const intentConfidence = ruleMatch?.confidence || 0.3;
  const reasoning = ruleMatch?.reasoning || "No matching rules, defaulting to search";

  if (ruleMatch?.additionalSlots) {
    Object.assign(slots, ruleMatch.additionalSlots);
  }

  // Calculate slot completeness and adjust final confidence
  const slotCompleteness = calculateSlotCompleteness(intent, slots);
  const finalConfidence = Math.min(intentConfidence, slotCompleteness.score);

  // Determine if clarification is needed
  const needsClarification = finalConfidence < CONFIDENCE_THRESHOLD;
  let clarifyingQuestion: string | undefined;

  if (needsClarification) {
    clarifyingQuestion = getClarifyingQuestion(intent, slotCompleteness.missingSlots);
    if (!clarifyingQuestion) {
      clarifyingQuestion = "Could you provide more details?";
    }
  }

  return {
    intent,
    slots,
    confidence: getConfidenceLevel(finalConfidence),
    confidenceScore: finalConfidence,
    needsClarification,
    clarifyingQuestion,
    reasoning,
    usedModel: false,
    originalQuery: query,
  };
}
