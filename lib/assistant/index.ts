/**
 * Smart Assistant Module
 *
 * Exports the router, single-doc QA, clarification flow, and types.
 */

export { routeQuery, routeQuerySync } from "./router";
export { matchRules, inferIntentFromSlots, isQuestion, hasAggregationKeyword } from "./rules";
export { answerSingleDocumentQuestion } from "./single-qa";
export {
  handleAssistantQuery,
  handleFollowUp,
  createClarificationState,
  createConversationContext,
  mergeSlots,
  formatCandidatesForUser,
  formatDocumentSummary,
} from "./clarify";
export { executeSearch } from "./search-handler";
export { executeSum, formatSumResult } from "./sum-handler";
export { executeRAG, formatRAGResult } from "./rag-handler";
export { executeChat, formatChatResult } from "./chat-handler";
export type {
  Intent,
  Slots,
  RouterResult,
  ConfidenceLevel,
  RuleMatch,
  ClarificationRequirement,
  Citation,
  QAResult,
  SumResult,
  SumBreakdownItem,
  RAGResult,
  RAGDocumentRef,
  ClarificationState,
  ConversationContext,
  ConversationMessage,
  CandidateDocument,
  AssistantResponse,
  AssistantMode,
  ChatResult,
  BusinessContext,
} from "./types";
export { INTENT_DESCRIPTIONS, REQUIRED_SLOTS, RECOMMENDED_SLOTS } from "./types";
