/**
 * Smart Assistant Router Types
 *
 * Defines intents, slots, and router result structures.
 */

import type { ParsedQuery } from "../search/parse-query";

/**
 * User intent categories
 */
export type Intent = "search" | "single_qa" | "sum" | "rag";

/**
 * Assistant response mode
 */
export type AssistantMode = "owner" | "lawyer";

/**
 * Intent descriptions for logging and debugging
 */
export const INTENT_DESCRIPTIONS: Record<Intent, string> = {
  search: "Find/list documents matching criteria",
  single_qa: "Question about a specific document field",
  sum: "Numerical aggregation (totals, counts, averages)",
  rag: "Synthesized answer across multiple documents",
};

/**
 * Slots extracted from query - extends ParsedQuery with additional fields
 */
export interface Slots {
  // From ParsedQuery
  date?: string;
  year?: number;
  month?: number;
  amount?: number;
  documentType?: string;
  vendor?: string;
  semanticText: string;

  // Additional slots for assistant
  field?: string; // Specific field being asked about (e.g., "total", "vendor")
  aggregation?: "sum" | "count" | "average" | "min" | "max";
  comparison?: "greater" | "less" | "equal";
  comparisonValue?: number;
}

/**
 * Confidence level for intent classification
 */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * Result from the router
 */
export interface RouterResult {
  /** Detected intent */
  intent: Intent;

  /** Extracted slots from query */
  slots: Slots;

  /** Confidence level: high (>0.85), medium (0.7-0.85), low (<0.7) */
  confidence: ConfidenceLevel;

  /** Numeric confidence score 0-1 */
  confidenceScore: number;

  /** Whether clarification is needed before proceeding */
  needsClarification: boolean;

  /** Question to ask user if clarification needed */
  clarifyingQuestion?: string;

  /** Brief explanation of classification */
  reasoning: string;

  /** Whether Gemini was used for classification */
  usedModel: boolean;

  /** Original query */
  originalQuery: string;
}

/**
 * Rule match result from pattern matching
 */
export interface RuleMatch {
  intent: Intent;
  confidence: number;
  reasoning: string;
  additionalSlots?: Partial<Slots>;
}

/**
 * Clarification requirement
 */
export interface ClarificationRequirement {
  slotName: keyof Slots;
  question: string;
  priority: number; // Higher = more important
}

/**
 * Required slots per intent
 */
export const REQUIRED_SLOTS: Record<Intent, (keyof Slots)[]> = {
  search: [], // Search can work with any slots
  single_qa: ["field"], // Need to know what field to query
  sum: ["aggregation"], // Need to know what aggregation
  rag: [], // RAG can work with semantic text alone
};

/**
 * Recommended slots per intent (for better results)
 */
export const RECOMMENDED_SLOTS: Record<Intent, (keyof Slots)[]> = {
  search: ["documentType", "vendor"],
  single_qa: ["documentType", "vendor"],
  sum: ["documentType", "year"],
  rag: ["vendor", "year"],
};

// ============================================================================
// Single Document QA Types
// ============================================================================

/**
 * A citation from a document with position and verification status
 */
export interface Citation {
  /** Document ID */
  docId: string;
  /** File name for display */
  fileName: string;
  /** Character span [start, end] in raw_text */
  span: [number, number];
  /** The quoted excerpt */
  excerpt: string;
  /** Whether the excerpt was verified against raw_text */
  verified: boolean;
}

/**
 * Result from single document QA
 */
export interface QAResult {
  /** The answer to the user's question, or null if not found */
  answer: string | null;
  /** Citations supporting the answer */
  citations: Citation[];
  /** Confidence based on citation verification */
  confidence: ConfidenceLevel;
  /** Whether all citations were verified against source */
  allCitationsVerified: boolean;
  /** Document used to answer the question */
  documentUsed?: {
    id: string;
    fileName: string;
    documentType: string;
  };
  /** Error type if something went wrong */
  error?: "document_not_found" | "multiple_matches" | "verification_failed" | "insufficient_info";
  /** Question to ask user if clarification needed */
  clarifyingQuestion?: string;
  /** Candidate documents when multiple matches */
  candidates?: CandidateDocument[];
}

// ============================================================================
// Clarification Flow Types
// ============================================================================

/**
 * A candidate document for disambiguation
 */
export interface CandidateDocument {
  /** Document ID */
  id: string;
  /** File name */
  fileName: string;
  /** Human-readable summary (e.g., "$1690.00, Jan 2011") */
  summary: string;
}

/**
 * State captured when clarification is needed
 */
export interface ClarificationState {
  /** Original user query */
  originalQuery: string;
  /** Slots extracted from original query */
  originalSlots: Slots;
  /** Intent detected from original query */
  originalIntent: Intent;
  /** Candidate documents if multiple matches */
  candidates?: CandidateDocument[];
  /** The clarifying question asked */
  question: string;
  /** When this state was created */
  timestamp: number;
}

/**
 * A message in the conversation history
 */
export interface ConversationMessage {
  /** Who sent the message */
  role: "user" | "assistant";
  /** The message content */
  content: string;
  /** Slots extracted (for user messages) */
  slots?: Slots;
}

/**
 * Full conversation context for multi-turn interactions
 */
export interface ConversationContext {
  /** Message history */
  history: ConversationMessage[];
  /** Pending clarification if waiting for user response */
  pendingClarification?: ClarificationState;
}

/**
 * Response from the assistant
 */
export interface AssistantResponse {
  /** The response message */
  message: string;
  /** Type of response */
  type: "answer" | "clarification" | "error";
  /** Audit request id for tracing */
  auditRequestId?: string;
  /** If answer, the QA result */
  qaResult?: QAResult;
  /** If sum, the sum result */
  sumResult?: SumResult;
  /** If rag, the RAG result */
  ragResult?: RAGResult;
  /** If clarification, the candidates */
  candidates?: CandidateDocument[];
  /** Updated conversation context */
  context: ConversationContext;
}

// ============================================================================
// Sum/Aggregation Types
// ============================================================================

/**
 * Breakdown item for grouped aggregations
 */
export interface SumBreakdownItem {
  /** Label for the group (e.g., vendor name or month) */
  label: string;
  /** Total amount for this group */
  amount: number;
  /** Number of documents in this group */
  count: number;
}

/**
 * Result from sum/aggregation queries
 */
export interface SumResult {
  /** The aggregated total amount */
  total: number;
  /** Number of documents included */
  count: number;
  /** Average per document */
  average?: number;
  /** Optional breakdown by vendor or time period */
  breakdown?: SumBreakdownItem[];
  /** Filters applied to get this result */
  filters: {
    documentType?: string;
    year?: number;
    dateRange?: { start: string; end: string };
    vendor?: string;
  };
  /** Always high for SQL results - numbers are exact */
  confidence: "high";
  /** The SQL query executed (for debugging) */
  sqlQuery?: string;
}

// ============================================================================
// RAG (Retrieval-Augmented Generation) Types
// ============================================================================

/**
 * A document used in RAG response
 */
export interface RAGDocumentRef {
  /** Document ID */
  id: string;
  /** File name */
  fileName: string;
  /** Document type */
  documentType: string;
  /** Relevance score from search */
  relevanceScore: number;
  /** Key extracted data */
  extractedData?: {
    vendor?: string;
    date?: string;
    total?: number;
  };
}

/**
 * Result from RAG (multi-document synthesis) queries
 */
export interface RAGResult {
  /** The synthesized answer */
  answer: string;
  /** Citations supporting the answer */
  citations: Citation[];
  /** Documents used to generate the answer */
  documentsUsed: RAGDocumentRef[];
  /** Confidence based on document relevance and citation verification */
  confidence: ConfidenceLevel;
  /** Error code when upstream dependency fails */
  errorCode?: "insufficient_info";
  /** Total amount across relevant documents (if applicable) */
  totalAmount?: number;
  /** Date range of relevant documents */
  dateRange?: { earliest: string; latest: string };
}
