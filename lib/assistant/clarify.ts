/**
 * Clarification Flow Handler
 *
 * Manages multi-turn conversations when the assistant needs more information
 * to answer a query. Handles slot merging, candidate selection, and context tracking.
 */

import { createHash } from "crypto";
import { parseQuery } from "../search/parse-query";
import { routeQuery, routeQuerySync, CONFIDENCE_THRESHOLD, getConfidenceLevel } from "./router";
import type {
  Slots,
  Intent,
  RouterResult,
  ClarificationState,
  ConversationContext,
  CandidateDocument,
  AssistantResponse,
  QAResult,
  RAGResult,
  Citation,
  AssistantMode,
} from "./types";
import { answerSingleDocumentQuestion } from "./single-qa";
import { executeSearch } from "./search-handler";
import { executeSum, formatSumResult } from "./sum-handler";
import { executeRAG, formatRAGResult } from "./rag-handler";
import { executeChat, formatChatResult } from "./chat-handler";
import type { AuditCitation } from "../audit/logger";
import { appendAudit, finalizeAudit, startAudit } from "../audit/logger";
import { INSUFFICIENT_INFO_MESSAGE } from "./messages";

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function summarizeText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.replace(/\s+/g, " ").trim().slice(0, 280);
}

function sanitizeSlots(slots: Slots): Record<string, unknown> {
  return {
    date: slots.date,
    year: slots.year,
    month: slots.month,
    amount: slots.amount,
    documentType: slots.documentType,
    vendor: slots.vendor,
    field: slots.field,
    aggregation: slots.aggregation,
    comparison: slots.comparison,
    comparisonValue: slots.comparisonValue,
  };
}

function buildCitationMetadata(citations: Citation[]): AuditCitation[] {
  return citations.map((c) => ({
    document_id: c.docId,
    start_offset: c.span?.[0],
    end_offset: c.span?.[1],
    excerpt: c.excerpt ? c.excerpt.slice(0, 300) : undefined,
    verified: c.verified,
    score: c.verified ? 1 : 0,
  }));
}

function citationVerifiedRatio(citations: Citation[]): number {
  if (citations.length === 0) return 0;
  const verified = citations.filter((c) => c.verified).length;
  return verified / citations.length;
}

function buildInsufficientQAResult(): QAResult {
  return {
    answer: null,
    citations: [],
    confidence: "low",
    allCitationsVerified: false,
    error: "insufficient_info",
  };
}

export interface AssistantHandlers {
  executeSearch: typeof executeSearch;
  executeSum: typeof executeSum;
  executeRAG: typeof executeRAG;
  executeChat: typeof executeChat;
  answerSingleDocumentQuestion: typeof answerSingleDocumentQuestion;
}

function resolveAssistantHandlers(overrides?: Partial<AssistantHandlers>): AssistantHandlers {
  return {
    executeSearch,
    executeSum,
    executeRAG,
    executeChat,
    answerSingleDocumentQuestion,
    ...overrides,
  };
}

/**
 * Create an empty conversation context
 */
export function createConversationContext(): ConversationContext {
  return {
    history: [],
    pendingClarification: undefined,
  };
}

/**
 * Create clarification state from router result or QA result
 */
export function createClarificationState(
  query: string,
  slots: Slots,
  intent: Intent,
  question: string,
  candidates?: CandidateDocument[]
): ClarificationState {
  return {
    originalQuery: query,
    originalSlots: slots,
    originalIntent: intent,
    candidates,
    question,
    timestamp: Date.now(),
  };
}

/**
 * Format document info into a readable summary
 */
export function formatDocumentSummary(
  doc: { file_name: string; extraction: Record<string, unknown> }
): string {
  const ext = doc.extraction as Record<string, unknown>;
  const data = (ext?.data || ext) as Record<string, unknown>;

  const parts: string[] = [];

  // Add amount if available
  const total = data?.total as number | undefined;
  if (total) {
    parts.push(`$${total.toFixed(2)}`);
  }

  // Add date if available
  const date = (data?.invoice_date || data?.date) as string | undefined;
  if (date) {
    // Format as "Jan 19, 2011"
    try {
      const d = new Date(date);
      const formatted = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      parts.push(formatted);
    } catch {
      parts.push(date);
    }
  }

  // Add vendor if available
  const vendor = (data?.vendor || data?.merchant_name) as string | undefined;
  if (vendor && parts.length < 2) {
    parts.push(vendor.slice(0, 30));
  }

  return parts.join(", ") || doc.file_name;
}

/**
 * Format candidates as a numbered list for user display
 */
export function formatCandidatesForUser(candidates: CandidateDocument[]): string {
  if (candidates.length === 0) return "";

  const lines = [`I found ${candidates.length} matching documents:`];
  candidates.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.summary}`);
  });
  lines.push("\nWhich one are you asking about?");

  return lines.join("\n");
}

/**
 * Merge slots from original query with follow-up query
 * Follow-up slots override original if there's a conflict
 */
export function mergeSlots(original: Slots, followUp: Slots): Slots {
  const merged: Slots = {
    semanticText: "",
  };

  // Copy original slots
  if (original.date) merged.date = original.date;
  if (original.year) merged.year = original.year;
  if (original.month) merged.month = original.month;
  if (original.amount) merged.amount = original.amount;
  if (original.documentType) merged.documentType = original.documentType;
  if (original.vendor) merged.vendor = original.vendor;
  if (original.field) merged.field = original.field;
  if (original.aggregation) merged.aggregation = original.aggregation;
  if (original.comparison) merged.comparison = original.comparison;
  if (original.comparisonValue) merged.comparisonValue = original.comparisonValue;

  // Override with follow-up slots (non-empty values only)
  if (followUp.date) merged.date = followUp.date;
  if (followUp.year) merged.year = followUp.year;
  if (followUp.month) merged.month = followUp.month;
  if (followUp.amount) merged.amount = followUp.amount;
  if (followUp.documentType) merged.documentType = followUp.documentType;
  if (followUp.vendor) merged.vendor = followUp.vendor;
  if (followUp.field) merged.field = followUp.field;
  if (followUp.aggregation) merged.aggregation = followUp.aggregation;
  if (followUp.comparison) merged.comparison = followUp.comparison;
  if (followUp.comparisonValue) merged.comparisonValue = followUp.comparisonValue;

  // Combine semantic text (append new info)
  const originalText = original.semanticText.trim();
  const followUpText = followUp.semanticText.trim();
  if (originalText && followUpText) {
    merged.semanticText = `${originalText} ${followUpText}`;
  } else {
    merged.semanticText = followUpText || originalText;
  }

  return merged;
}

/**
 * Parse a direct selection from user input
 * Returns the index (0-based) if user selected by number, or -1 if not a selection
 */
function parseDirectSelection(query: string, candidateCount: number): number {
  const normalized = query.trim().toLowerCase();

  // Match "1", "option 1", "the first one", "#1", "number 1"
  const patterns = [
    /^(\d+)$/,                           // Just a number
    /^(?:option|#|number)\s*(\d+)$/i,    // "option 1", "#1", "number 1"
    /^the\s+(first|second|third|fourth|fifth)\s+(?:one)?$/i,  // "the first one"
    /^(first|second|third|fourth|fifth)$/i,  // Just ordinal
  ];

  const ordinals: Record<string, number> = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  };

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const value = match[1];
      let index: number;

      if (/^\d+$/.test(value)) {
        index = parseInt(value, 10) - 1; // Convert to 0-based
      } else {
        index = (ordinals[value.toLowerCase()] || 0) - 1;
      }

      if (index >= 0 && index < candidateCount) {
        return index;
      }
    }
  }

  return -1;
}

/**
 * Handle a follow-up query when clarification was requested
 */
export async function handleFollowUp(
  followUpQuery: string,
  state: ClarificationState
): Promise<{ routerResult: RouterResult; selectedCandidate?: CandidateDocument }> {
  console.log(`[Clarify] Handling follow-up: "${followUpQuery}"`);

  // Check for direct selection first
  if (state.candidates && state.candidates.length > 0) {
    const selectionIndex = parseDirectSelection(followUpQuery, state.candidates.length);
    if (selectionIndex >= 0) {
      const selected = state.candidates[selectionIndex];
      console.log(`[Clarify] Direct selection: option ${selectionIndex + 1} = ${selected.fileName}`);

      // Create a router result with the selected document info
      return {
        routerResult: {
          intent: state.originalIntent,
          slots: {
            ...state.originalSlots,
            // Add document identifier to semantic text for matching
            semanticText: `${state.originalSlots.semanticText} ${selected.summary}`,
          },
          confidence: "high",
          confidenceScore: 0.95,
          needsClarification: false,
          reasoning: `User selected option ${selectionIndex + 1}`,
          usedModel: false,
          originalQuery: followUpQuery,
        },
        selectedCandidate: selected,
      };
    }
  }

  // Parse follow-up for new slot values
  const parsed = parseQuery(followUpQuery);
  const followUpSlots: Slots = {
    date: parsed.date,
    year: parsed.year,
    month: parsed.month,
    amount: parsed.amount,
    documentType: parsed.documentType,
    vendor: parsed.vendor,
    semanticText: parsed.semanticText,
  };

  // Merge with original slots
  const mergedSlots = mergeSlots(state.originalSlots, followUpSlots);
  console.log(`[Clarify] Merged slots: type=${mergedSlots.documentType}, amount=${mergedSlots.amount}, year=${mergedSlots.year}`);

  // Create enriched query for routing
  const enrichedQuery = `${state.originalQuery} ${followUpQuery}`;

  // Re-route with merged context
  const routerResult = routeQuerySync(enrichedQuery);

  // Override with merged slots and original intent
  // Recalculate needsClarification from boosted score (don't spread old value)
  const boostedScore = Math.min(1.0, routerResult.confidenceScore + 0.2);
  return {
    routerResult: {
      ...routerResult,
      intent: state.originalIntent,
      slots: mergedSlots,
      confidenceScore: boostedScore,
      confidence: getConfidenceLevel(boostedScore),
      needsClarification: boostedScore < CONFIDENCE_THRESHOLD,
      clarifyingQuestion: boostedScore < CONFIDENCE_THRESHOLD
        ? routerResult.clarifyingQuestion
        : undefined,
    },
  };
}

/**
 * Main assistant entry point - handles full conversation flow
 */
export async function handleAssistantQuery(
  query: string,
  context?: ConversationContext,
  handlerOverrides?: Partial<AssistantHandlers>,
  options?: { mode?: AssistantMode }
): Promise<AssistantResponse> {
  const handlers = resolveAssistantHandlers(handlerOverrides);
  const ctx = context || createConversationContext();
  const mode: AssistantMode = options?.mode ?? "owner";
  const startedAuditRequestId = await startAudit({ actor: "system", inputText: query });
  const auditRequestId = startedAuditRequestId ?? undefined;

  // Add user message to history
  ctx.history.push({
    role: "user",
    content: query,
  });

  // Check if this is a follow-up to pending clarification
  if (ctx.pendingClarification) {
    console.log("[Assistant] Processing follow-up to clarification");

    // Store the original question BEFORE clearing the pending state
    const originalQuestion = ctx.pendingClarification.originalQuery;

    const { routerResult, selectedCandidate } = await handleFollowUp(
      query,
      ctx.pendingClarification
    );

    // Clear pending clarification
    ctx.pendingClarification = undefined;

    if (auditRequestId) {
      await appendAudit(auditRequestId, {
        intent: routerResult.intent,
        confidence: routerResult.confidence,
        slots: sanitizeSlots(routerResult.slots),
      });
    }

    // If still needs clarification, ask again
    if (routerResult.needsClarification) {
      const clarificationState = createClarificationState(
        routerResult.originalQuery,
        routerResult.slots,
        routerResult.intent,
        routerResult.clarifyingQuestion || "Could you provide more details?"
      );
      ctx.pendingClarification = clarificationState;

      ctx.history.push({
        role: "assistant",
        content: clarificationState.question,
      });

      if (auditRequestId) {
        await appendAudit(auditRequestId, {
          intent: routerResult.intent,
          confidence: routerResult.confidence,
          slots: sanitizeSlots(routerResult.slots),
        });
        await finalizeAudit(auditRequestId, {
          status: "clarification",
          output_hash: hashText(clarificationState.question),
          output_summary: summarizeText(clarificationState.question),
        });
      }

      return {
        message: clarificationState.question,
        type: "clarification",
        auditRequestId,
        context: ctx,
      };
    }

    // Process based on intent
    if (routerResult.intent === "single_qa") {
      // If we have a selected candidate, use it directly
      if (selectedCandidate) {
        // Create slots that will match this specific document
        const slots: Slots = {
          ...routerResult.slots,
          semanticText: selectedCandidate.fileName,
        };

        let qaResult: QAResult;
        try {
          qaResult = await handlers.answerSingleDocumentQuestion(
            originalQuestion, // Use original question, not follow-up
            slots,
            { mode }
          );
        } catch {
          qaResult = buildInsufficientQAResult();
        }

        return handleQAResult(qaResult, ctx, auditRequestId);
      }

      let qaResult: QAResult;
      try {
        qaResult = await handlers.answerSingleDocumentQuestion(
          originalQuestion, // Use original question
          routerResult.slots,
          { mode }
        );
      } catch {
        qaResult = buildInsufficientQAResult();
      }

      return handleQAResult(qaResult, ctx, auditRequestId);
    }

    // Handle search intent with merged slots
    if (routerResult.intent === "search") {
      const searchResult = await handlers.executeSearch(routerResult.slots);

      ctx.history.push({
        role: "assistant",
        content: searchResult.message,
      });
      ctx.lastIntent = routerResult.intent;
      ctx.lastSlots = routerResult.slots;

      if (auditRequestId) {
        await appendAudit(auditRequestId, {
          intent: "search",
          confidence: routerResult.confidence,
          slots: sanitizeSlots(routerResult.slots),
          retrieval: { document_ids: searchResult.results.map((r) => r.id) },
        });
        await finalizeAudit(auditRequestId, {
          status: searchResult.success ? "success" : "error",
          output_hash: hashText(searchResult.message),
          output_summary: summarizeText(searchResult.message),
          error: searchResult.success ? undefined : "search_failed",
        });
      }

      return {
        message: searchResult.message,
        type: searchResult.success ? "answer" : "error",
        auditRequestId,
        searchResults: searchResult.results.map((r) => ({
          id: r.id,
          fileName: r.fileName,
          documentType: r.documentType,
          score: r.score,
          extraction: r.extraction,
        })),
        context: ctx,
      };
    }

    // Handle sum intent with merged slots
    if (routerResult.intent === "sum") {
      const sumResult = await handlers.executeSum(routerResult.slots);
      const message = formatSumResult(sumResult, routerResult.slots);

      ctx.history.push({
        role: "assistant",
        content: message,
      });
      ctx.lastIntent = routerResult.intent;
      ctx.lastSlots = routerResult.slots;

      if (auditRequestId) {
        await appendAudit(auditRequestId, {
          intent: "sum",
          confidence: routerResult.confidence,
          slots: sanitizeSlots(routerResult.slots),
          sql_path_used: true,
          sql_query: sumResult.sqlQuery,
        });
        await finalizeAudit(auditRequestId, {
          status: "success",
          output_hash: hashText(message),
          output_summary: summarizeText(message),
        });
      }

      return {
        message,
        type: "answer",
        sumResult,
        auditRequestId,
        context: ctx,
      };
    }

    // Handle rag intent with merged slots
    if (routerResult.intent === "rag") {
      let ragResult: RAGResult;
      try {
        ragResult = await handlers.executeRAG(originalQuestion, routerResult.slots, { mode });
      } catch {
        ragResult = {
          answer: INSUFFICIENT_INFO_MESSAGE,
          citations: [],
          documentsUsed: [],
          confidence: "low",
          errorCode: "insufficient_info",
        };
      }
      const isRagError = ragResult.errorCode === "insufficient_info";
      const message = isRagError
        ? INSUFFICIENT_INFO_MESSAGE
        : formatRAGResult(ragResult, mode);

      ctx.history.push({
        role: "assistant",
        content: message,
      });
      if (!isRagError) {
        ctx.lastIntent = routerResult.intent;
        ctx.lastSlots = routerResult.slots;
      }

      if (auditRequestId) {
        const citations = buildCitationMetadata(ragResult.citations || []);
        await appendAudit(auditRequestId, {
          intent: "rag",
          confidence: routerResult.confidence,
          slots: sanitizeSlots(routerResult.slots),
          retrieval: { document_ids: ragResult.documentsUsed.map((d) => d.id) },
          citations,
          citations_verified_ratio: citationVerifiedRatio(ragResult.citations || []),
        });
        await finalizeAudit(auditRequestId, {
          status: isRagError || ragResult.confidence === "low" ? "error" : "success",
          output_hash: hashText(message),
          output_summary: summarizeText(message),
          error: isRagError ? ragResult.errorCode : undefined,
        });
      }

      return {
        message,
        type: isRagError || ragResult.confidence === "low" ? "error" : "answer",
        ragResult,
        auditRequestId,
        context: ctx,
      };
    }

    // Handle chat intent with merged slots
    if (routerResult.intent === "chat") {
      const chatResult = await handlers.executeChat(originalQuestion, routerResult.slots, { mode, history: ctx.history });
      const message = formatChatResult(chatResult);

      ctx.history.push({ role: "assistant", content: message });
      ctx.lastIntent = routerResult.intent;
      ctx.lastSlots = routerResult.slots;

      if (auditRequestId) {
        await appendAudit(auditRequestId, {
          intent: "chat",
          confidence: routerResult.confidence,
          slots: sanitizeSlots(routerResult.slots),
        });
        await finalizeAudit(auditRequestId, {
          status: "success",
          output_hash: hashText(message),
          output_summary: summarizeText(message),
        });
      }

      return {
        message,
        type: "answer",
        chatResult,
        auditRequestId,
        context: ctx,
      };
    }

    // Fallback for unknown intents
    ctx.history.push({
      role: "assistant",
      content: `I'm not sure how to process this follow-up.`,
    });

    if (auditRequestId) {
      const message = "I'm not sure how to process this. Could you rephrase your question?";
      await finalizeAudit(auditRequestId, {
        status: "error",
        output_hash: hashText(message),
        output_summary: summarizeText(message),
        error: "unknown_intent",
      });
    }

    return {
      message: `I'm not sure how to process this. Could you rephrase your question?`,
      type: "error",
      auditRequestId,
      context: ctx,
    };
  }

  // Check for elliptical follow-up referencing previous turn
  if (!ctx.pendingClarification && ctx.lastIntent && ctx.lastSlots) {
    const words = query.trim().split(/\s+/);
    const isShort = words.length <= 10;
    const referentialWords = /\b(correct|right|those|that|it|them|more|other|instead|one|ones|these|which|same|again|else|different)\b/i;
    const hasReferential = referentialWords.test(query);
    // Check that this doesn't have a strong intent signal of its own
    const hasStrongIntent = /\b(find|show|search|how much|total|sum|what is|list|get)\b/i.test(query);

    if (isShort && hasReferential && !hasStrongIntent) {
      console.log(`[Assistant] Elliptical follow-up detected: "${query}" → re-entering ${ctx.lastIntent} flow`);
      const syntheticState = createClarificationState(
        ctx.history.filter((m) => m.role === "user").slice(-2, -1)[0]?.content || query,
        ctx.lastSlots,
        ctx.lastIntent,
        query,
      );
      const { routerResult: followUpResult } = await handleFollowUp(query, syntheticState);

      // Process with the carried-over intent
      ctx.pendingClarification = undefined;

      if (auditRequestId) {
        await appendAudit(auditRequestId, {
          intent: followUpResult.intent,
          confidence: followUpResult.confidence,
          slots: sanitizeSlots(followUpResult.slots),
        });
      }

      // Dispatch to the correct handler
      if (followUpResult.intent === "search") {
        const searchResult = await handlers.executeSearch(followUpResult.slots);
        ctx.history.push({ role: "assistant", content: searchResult.message });
        ctx.lastIntent = followUpResult.intent;
        ctx.lastSlots = followUpResult.slots;

        if (auditRequestId) {
          await appendAudit(auditRequestId, {
            intent: "search",
            retrieval: { document_ids: searchResult.results.map((r) => r.id) },
          });
          await finalizeAudit(auditRequestId, {
            status: searchResult.success ? "success" : "error",
            output_hash: hashText(searchResult.message),
            output_summary: summarizeText(searchResult.message),
          });
        }

        return {
          message: searchResult.message,
          type: searchResult.success ? "answer" : "error",
          auditRequestId,
          searchResults: searchResult.results.map((r) => ({
            id: r.id,
            fileName: r.fileName,
            documentType: r.documentType,
            score: r.score,
            extraction: r.extraction,
          })),
          context: ctx,
        };
      }

      if (followUpResult.intent === "sum") {
        const sumResult = await handlers.executeSum(followUpResult.slots);
        const message = formatSumResult(sumResult, followUpResult.slots);
        ctx.history.push({ role: "assistant", content: message });
        ctx.lastIntent = followUpResult.intent;
        ctx.lastSlots = followUpResult.slots;

        if (auditRequestId) {
          await finalizeAudit(auditRequestId, {
            status: "success",
            output_hash: hashText(message),
            output_summary: summarizeText(message),
          });
        }

        return {
          message,
          type: "answer",
          sumResult,
          auditRequestId,
          context: ctx,
        };
      }

      // For other intents, fall through to normal routing below
    }
  }

  // Normal flow - route the query (async enables Gemini model fallback)
  const routerResult = await routeQuery(query);
  console.log(`[Assistant] Routed: intent=${routerResult.intent}, confidence=${routerResult.confidence}`);

  if (auditRequestId) {
    await appendAudit(auditRequestId, {
      intent: routerResult.intent,
      confidence: routerResult.confidence,
      slots: sanitizeSlots(routerResult.slots),
    });
  }

  // If needs clarification, create state and return question
  if (routerResult.needsClarification) {
    const clarificationState = createClarificationState(
      query,
      routerResult.slots,
      routerResult.intent,
      routerResult.clarifyingQuestion || "Could you provide more details?"
    );
    ctx.pendingClarification = clarificationState;

    ctx.history.push({
      role: "assistant",
      content: clarificationState.question,
    });

    if (auditRequestId) {
      await finalizeAudit(auditRequestId, {
        status: "clarification",
        output_hash: hashText(clarificationState.question),
        output_summary: summarizeText(clarificationState.question),
      });
    }

    return {
      message: clarificationState.question,
      type: "clarification",
      auditRequestId,
      context: ctx,
    };
  }

  // Process based on intent
  if (routerResult.intent === "single_qa") {
    let qaResult: QAResult;
    try {
      qaResult = await handlers.answerSingleDocumentQuestion(query, routerResult.slots, { mode });
    } catch {
      qaResult = buildInsufficientQAResult();
    }
    return handleQAResult(qaResult, ctx, auditRequestId);
  }

  if (routerResult.intent === "search") {
    const searchResult = await handlers.executeSearch(routerResult.slots);

    ctx.history.push({
      role: "assistant",
      content: searchResult.message,
    });
    ctx.lastIntent = routerResult.intent;
    ctx.lastSlots = routerResult.slots;

    if (auditRequestId) {
      await appendAudit(auditRequestId, {
        intent: "search",
        confidence: routerResult.confidence,
        slots: sanitizeSlots(routerResult.slots),
        retrieval: { document_ids: searchResult.results.map((r) => r.id) },
      });
      await finalizeAudit(auditRequestId, {
        status: searchResult.success ? "success" : "error",
        output_hash: hashText(searchResult.message),
        output_summary: summarizeText(searchResult.message),
        error: searchResult.success ? undefined : "search_failed",
      });
    }

    return {
      message: searchResult.message,
      type: searchResult.success ? "answer" : "error",
      auditRequestId,
      searchResults: searchResult.results.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        documentType: r.documentType,
        score: r.score,
        extraction: r.extraction,
      })),
      context: ctx,
    };
  }

  if (routerResult.intent === "sum") {
    const sumResult = await handlers.executeSum(routerResult.slots);
    const message = formatSumResult(sumResult, routerResult.slots);

    ctx.history.push({
      role: "assistant",
      content: message,
    });
    ctx.lastIntent = routerResult.intent;
    ctx.lastSlots = routerResult.slots;

    if (auditRequestId) {
      await appendAudit(auditRequestId, {
        intent: "sum",
        confidence: routerResult.confidence,
        slots: sanitizeSlots(routerResult.slots),
        sql_path_used: true,
        sql_query: sumResult.sqlQuery,
      });
      await finalizeAudit(auditRequestId, {
        status: "success",
        output_hash: hashText(message),
        output_summary: summarizeText(message),
      });
    }

    return {
      message,
      type: "answer",
      sumResult,
      auditRequestId,
      context: ctx,
    };
  }

  if (routerResult.intent === "rag") {
    let ragResult: RAGResult;
    try {
      ragResult = await handlers.executeRAG(query, routerResult.slots, { mode });
    } catch {
      ragResult = {
        answer: INSUFFICIENT_INFO_MESSAGE,
        citations: [],
        documentsUsed: [],
        confidence: "low",
        errorCode: "insufficient_info",
      };
    }
    const isRagError = ragResult.errorCode === "insufficient_info";
    const message = isRagError
      ? INSUFFICIENT_INFO_MESSAGE
      : formatRAGResult(ragResult, mode);

    ctx.history.push({
      role: "assistant",
      content: message,
    });
    if (!isRagError) {
      ctx.lastIntent = routerResult.intent;
      ctx.lastSlots = routerResult.slots;
    }

    if (auditRequestId) {
      const citations = buildCitationMetadata(ragResult.citations || []);
      await appendAudit(auditRequestId, {
        intent: "rag",
        confidence: routerResult.confidence,
        slots: sanitizeSlots(routerResult.slots),
        retrieval: { document_ids: ragResult.documentsUsed.map((d) => d.id) },
        citations,
        citations_verified_ratio: citationVerifiedRatio(ragResult.citations || []),
      });
      await finalizeAudit(auditRequestId, {
        status: isRagError || ragResult.confidence === "low" ? "error" : "success",
        output_hash: hashText(message),
        output_summary: summarizeText(message),
        error: isRagError ? ragResult.errorCode : undefined,
      });
    }

    return {
      message,
      type: isRagError || ragResult.confidence === "low" ? "error" : "answer",
      ragResult,
      auditRequestId,
      context: ctx,
    };
  }

  if (routerResult.intent === "chat") {
    const chatResult = await handlers.executeChat(query, routerResult.slots, { mode, history: ctx.history });
    const message = formatChatResult(chatResult);

    ctx.history.push({ role: "assistant", content: message });
    ctx.lastIntent = routerResult.intent;
    ctx.lastSlots = routerResult.slots;

    if (auditRequestId) {
      await appendAudit(auditRequestId, {
        intent: "chat",
        confidence: routerResult.confidence,
        slots: sanitizeSlots(routerResult.slots),
      });
      await finalizeAudit(auditRequestId, {
        status: "success",
        output_hash: hashText(message),
        output_summary: summarizeText(message),
      });
    }

    return {
      message,
      type: "answer",
      chatResult,
      auditRequestId,
      context: ctx,
    };
  }

  // Fallback for unknown intents
  ctx.history.push({
    role: "assistant",
    content: `I'm not sure how to process this request.`,
  });

  if (auditRequestId) {
    const message = "I'm not sure how to process this request. Could you rephrase your question?";
    await finalizeAudit(auditRequestId, {
      status: "error",
      output_hash: hashText(message),
      output_summary: summarizeText(message),
      error: "unknown_intent",
    });
  }

  return {
    message: `I'm not sure how to process this request. Could you rephrase your question?`,
    type: "error",
    auditRequestId,
    context: ctx,
  };
}

/**
 * Handle QA result and format response
 */
async function handleQAResult(
  qaResult: QAResult,
  ctx: ConversationContext,
  auditRequestId?: string
): Promise<AssistantResponse> {
  // Handle multiple matches - need clarification
  if (qaResult.error === "multiple_matches") {
    // Use candidates from QA result, or parse from question as fallback
    const candidates = qaResult.candidates || parseCanndidatesFromQuestion(qaResult.clarifyingQuestion || "");

    const clarificationState = createClarificationState(
      ctx.history[ctx.history.length - 1]?.content || "",
      { semanticText: "" }, // Will be filled from context
      "single_qa",
      qaResult.clarifyingQuestion || "Which document are you asking about?",
      candidates
    );
    ctx.pendingClarification = clarificationState;

    const formattedMessage = candidates.length > 0
      ? formatCandidatesForUser(candidates)
      : qaResult.clarifyingQuestion || "Which document are you asking about?";

    ctx.history.push({
      role: "assistant",
      content: formattedMessage,
    });

    if (auditRequestId) {
      await appendAudit(auditRequestId, {
        intent: "single_qa",
        retrieval: {
          candidate_ids: candidates.map((c) => c.id),
        },
      });
      await finalizeAudit(auditRequestId, {
        status: "clarification",
        output_hash: hashText(formattedMessage),
        output_summary: summarizeText(formattedMessage),
      });
    }

    return {
      message: formattedMessage,
      type: "clarification",
      candidates,
      auditRequestId,
      context: ctx,
    };
  }

  // Handle document not found
  if (qaResult.error === "document_not_found") {
    const message = "I couldn't find a document matching your query. Could you provide more details like the vendor name, date, or amount?";
    ctx.history.push({
      role: "assistant",
      content: message,
    });

    if (auditRequestId) {
      await finalizeAudit(auditRequestId, {
        status: "error",
        output_hash: hashText(message),
        output_summary: summarizeText(message),
        error: "document_not_found",
      });
    }

    return {
      message,
      type: "error",
      auditRequestId,
      context: ctx,
    };
  }

  if (qaResult.error === "insufficient_info") {
    const message = INSUFFICIENT_INFO_MESSAGE;
    ctx.history.push({
      role: "assistant",
      content: message,
    });

    if (auditRequestId) {
      await finalizeAudit(auditRequestId, {
        status: "error",
        output_hash: hashText(message),
        output_summary: summarizeText(message),
        error: "insufficient_info",
      });
    }

    return {
      message,
      type: "error",
      auditRequestId,
      context: ctx,
    };
  }

  // Handle successful answer
  if (qaResult.answer) {
    ctx.history.push({
      role: "assistant",
      content: qaResult.answer,
    });

    if (auditRequestId) {
      await appendAudit(auditRequestId, {
        intent: "single_qa",
        retrieval: {
          document_ids: qaResult.documentUsed ? [qaResult.documentUsed.id] : [],
        },
        citations: buildCitationMetadata(qaResult.citations || []),
        citations_verified_ratio: citationVerifiedRatio(qaResult.citations || []),
      });
      await finalizeAudit(auditRequestId, {
        status: "success",
        output_hash: hashText(qaResult.answer),
        output_summary: summarizeText(qaResult.answer),
      });
    }

    return {
      message: qaResult.answer,
      type: "answer",
      qaResult,
      auditRequestId,
      context: ctx,
    };
  }

  // Fallback
  const message = "I wasn't able to find an answer. Please try rephrasing your question.";
  ctx.history.push({
    role: "assistant",
    content: message,
  });

  if (auditRequestId) {
    await finalizeAudit(auditRequestId, {
      status: "error",
      output_hash: hashText(message),
      output_summary: summarizeText(message),
      error: qaResult.error || "unknown",
    });
  }

  return {
    message,
    type: "error",
    auditRequestId,
    context: ctx,
  };
}

/**
 * Parse candidates from a clarifying question string
 * (Temporary until we refactor single-qa to return candidates directly)
 */
function parseCanndidatesFromQuestion(question: string): CandidateDocument[] {
  const candidates: CandidateDocument[] = [];

  // Match filenames from "I found multiple matching documents: file1.pdf, file2.pdf, file3.pdf"
  const match = question.match(/documents?:\s*(.+)\.\s*Which/i);
  if (match) {
    const fileList = match[1];
    const files = fileList.split(/,\s*/);

    files.forEach((fileName, index) => {
      // Extract amount and date from filename
      const amountMatch = fileName.match(/(?:\$|USD)([0-9,.]+)/i);
      const dateMatch = fileName.match(/(\d{4}-\d{2}-\d{2})/);

      let summary = fileName;
      if (amountMatch || dateMatch) {
        const parts: string[] = [];
        if (amountMatch) parts.push(`$${amountMatch[1]}`);
        if (dateMatch) {
          try {
            const d = new Date(dateMatch[1]);
            parts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
          } catch {
            parts.push(dateMatch[1]);
          }
        }
        summary = parts.join(", ");
      }

      candidates.push({
        id: `candidate-${index}`,
        fileName: fileName.trim(),
        summary,
      });
    });
  }

  return candidates;
}
