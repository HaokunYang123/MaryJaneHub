/**
 * Rule-based Intent Matching
 *
 * Pattern matching for common query types. Designed to handle 90% of queries
 * without needing a model call.
 */

import type { Intent, RuleMatch, Slots } from "./types";

interface Rule {
  name: string;
  patterns: RegExp[];
  intent: Intent;
  baseConfidence: number;
  extractSlots?: (query: string, match: RegExpMatchArray) => Partial<Slots>;
}

/**
 * Field name mappings for single_qa intent
 */
const FIELD_PATTERNS: Record<string, string> = {
  total: "total",
  amount: "total",
  price: "total",
  cost: "total",
  vendor: "vendor",
  company: "vendor",
  merchant: "vendor",
  date: "invoice_date",
  "invoice date": "invoice_date",
  "due date": "due_date",
  number: "invoice_number",
  "invoice number": "invoice_number",
};

/**
 * Aggregation keywords
 */
const AGGREGATION_PATTERNS: Record<string, Slots["aggregation"]> = {
  total: "sum",
  sum: "sum",
  "add up": "sum",
  "how much": "sum",
  count: "count",
  "how many": "count",
  average: "average",
  avg: "average",
  mean: "average",
  minimum: "min",
  min: "min",
  lowest: "min",
  maximum: "max",
  max: "max",
  highest: "max",
};

/**
 * Detect when a query refers to a specific document (not a collection)
 * Used to prevent sum intent from hijacking single-document questions.
 */
function hasSpecificDocumentIndicator(query: string, slots: Slots): boolean {
  const lowerQuery = query.toLowerCase();
  const hasSingularDoc = /\b(invoice|receipt|document)\b/i.test(query);
  const hasPluralDoc = /\b(invoices|receipts|documents)\b/i.test(query);

  if (!hasSingularDoc || hasPluralDoc) return false;

  // Explicit identifiers or pointers
  if (/\b(?:this|that|the)\b/i.test(lowerQuery)) return true;
  if (/\b(?:invoice|document|receipt)\s*(?:#|no\.?|number|id)\s*\w+/i.test(query)) return true;
  if (/\bfile(?:name)?\b/i.test(lowerQuery)) return true;

  // Date indicators (including month+day without year)
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}\b/i.test(lowerQuery)) {
    return true;
  }
  if (/\b\d{1,2}[\/\-]\d{1,2}\b/.test(lowerQuery)) return true;
  if (/\b(?:dated|on)\s+\w+\s+\d{1,2}\b/i.test(lowerQuery)) return true;
  if (slots.date) return true;

  // Amounts are usually tied to a single document when singular doc is present
  if (slots.amount) return true;

  return false;
}

/**
 * Rule definitions - order matters (first match wins)
 */
const RULES: Rule[] = [
  // === SINGLE_QA for specific document questions (must come before sum) ===
  {
    name: "single_qa_on_specific",
    patterns: [
      // "what's the total ON the X invoice" - specific document (handles $XXX amounts)
      /\bwhat(?:'s| is| was)\s+(?:the\s+)?(?:total|amount|date|vendor)\s+on\s+(?:the\s+)?(?:[\$\w]+\s+)?(?:\w+\s+)?(?:invoice|receipt|document)\b/i,
      // "what's the total FOR the X invoice" - specific document
      /\bwhat(?:'s| is| was)\s+(?:the\s+)?(?:total|amount|date|vendor)\s+for\s+(?:the\s+)?(?:\$[\d,.]+\s+)?(?:\w+\s+)?(?:invoice|receipt)\b/i,
      // "what is the total on the invoice" with any identifier before invoice
      /\bwhat(?:'s| is| was)\s+(?:the\s+)?(?:total|amount|date|vendor)\s+on\s+.+(?:invoice|receipt|document)\b/i,
    ],
    intent: "single_qa",
    baseConfidence: 0.95,
    extractSlots: (query) => {
      if (/\btotal|amount\b/i.test(query)) return { field: "total" };
      if (/\bdate\b/i.test(query)) return { field: "invoice_date" };
      if (/\bvendor\b/i.test(query)) return { field: "vendor" };
      return {};
    },
  },

  // === SUM INTENT (aggregation queries) ===
  {
    name: "sum_total_query",
    patterns: [
      /\b(?:what(?:'s| is| was)?|how much)\s+(?:is\s+)?(?:the\s+)?total\b/i,
      /\b(?:total|sum|add up)\s+(?:of\s+)?(?:all\s+)?(?:the\s+)?/i,
      /\bhow much\s+(?:did|do|have)\s+(?:we|i)\s+(?:spend|spent|pay|paid)\b/i,
      /\b(?:calculate|compute|get)\s+(?:the\s+)?(?:total|sum)\b/i,
    ],
    intent: "sum",
    baseConfidence: 0.9,
    extractSlots: (query) => {
      const slots: Partial<Slots> = { aggregation: "sum" };
      // Check for specific field
      if (/\btotal\b/i.test(query)) slots.field = "total";
      return slots;
    },
  },
  {
    name: "sum_count_query",
    patterns: [
      /\bhow many\s+(?:\w+\s+)?(?:invoices?|receipts?|documents?|contracts?)\b/i,
      /\bcount\s+(?:of\s+)?(?:all\s+)?(?:the\s+)?/i,
      /\bnumber of\s+(?:\w+\s+)?(?:invoices?|receipts?|documents?)\b/i,
    ],
    intent: "sum",
    baseConfidence: 0.9,
    extractSlots: () => ({ aggregation: "count" }),
  },
  {
    name: "sum_average_query",
    patterns: [
      /\b(?:average|avg|mean)\s+(?:\w+\s+)?(?:amount|total|cost|price)\b/i,
      /\bwhat(?:'s| is| was)\s+(?:the\s+)?(?:average|avg)\b/i,
    ],
    intent: "sum",
    baseConfidence: 0.9,
    extractSlots: () => ({ aggregation: "average", field: "total" }),
  },

  // === SINGLE_QA INTENT (specific field questions) ===
  {
    name: "single_qa_field",
    patterns: [
      /\bwhat(?:'s| is| was)\s+(?:the\s+)?(\w+)\s+(?:for|on|of)\s+/i,
      /\b(?:show|tell|give)\s+(?:me\s+)?(?:the\s+)?(\w+)\s+(?:for|on|of)\s+/i,
      /\bwhat\s+(?:is|was)\s+(?:the\s+)?(?:total|amount|cost|price)\s+(?:for|on|of)\s+/i,
    ],
    intent: "single_qa",
    baseConfidence: 0.85,
    extractSlots: (query, match) => {
      const fieldWord = match[1]?.toLowerCase();
      const field = FIELD_PATTERNS[fieldWord] || fieldWord;
      return { field };
    },
  },
  {
    name: "single_qa_specific_doc",
    patterns: [
      /\bwhat(?:'s| is| was)\s+(?:the\s+)?(?:total|amount|vendor|date|number)\s+(?:for|on)\s+(?:the\s+)?(?:\w+\s+)?invoice\b/i,
      /\bwho\s+(?:is|was)\s+(?:the\s+)?vendor\b/i,
      /\bwhen\s+(?:is|was)\s+(?:it|this|that)\s+(?:dated|due)\b/i,
      /\bwhen\s+(?:is|was)\s+(?:the\s+)?(?:\w+\s+){0,3}?invoice\s+(?:dated|due)\b/i,
    ],
    intent: "single_qa",
    baseConfidence: 0.85,
    extractSlots: (query) => {
      // Extract field from query
      if (/\btotal|amount\b/i.test(query)) return { field: "total" };
      if (/\bvendor|who\b/i.test(query)) return { field: "vendor" };
      if (/\bdate|when\b/i.test(query)) return { field: "invoice_date" };
      if (/\bnumber\b/i.test(query)) return { field: "invoice_number" };
      return {};
    },
  },
  {
    name: "single_qa_invoice_number_for_vendor",
    patterns: [
      /\binvoice\s+number\s+(?:for|on)\s+(?:the\s+)?([A-Z][\w&.-]+(?:\s+[A-Z][\w&.-]+)?)\b/i,
    ],
    intent: "single_qa",
    baseConfidence: 0.9,
    extractSlots: (_query, match) => ({
      field: "invoice_number",
      vendor: match[1],
    }),
  },

  // === CHAT INTENT (greetings, casual, and broad business questions) ===
  {
    name: "chat_greeting",
    patterns: [
      /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|thanks|thank\s+you|sup|yo|howdy)\b/i,
    ],
    intent: "chat",
    baseConfidence: 0.95,
  },
  {
    name: "chat_casual",
    patterns: [
      /^(?:how\s+are\s+you|what\s+can\s+you\s+do|help|what\s+do\s+you\s+know)\b/i,
    ],
    intent: "chat",
    baseConfidence: 0.92,
  },
  {
    name: "chat_overview",
    patterns: [
      /\bhow\s+(?:is|are)\s+(?:my|our|the)\s+business\b/i,
      /\bgive\s+(?:me\s+)?(?:a\s+)?(?:business\s+)?(?:overview|snapshot|status|summary)\b/i,
      /\bbusiness\s+(?:status|overview|snapshot|summary|health)\b/i,
      /\bhow\s+(?:are|is)\s+(?:things|everything)\s+(?:going|looking|doing)\b/i,
    ],
    intent: "chat",
    baseConfidence: 0.92,
  },
  {
    name: "chat_vendors",
    patterns: [
      /\bwhat\s+vendors?\s+do\s+(?:we|i)\s+(?:work|deal)\s+with\b/i,
      /\bwho\s+(?:do|did)\s+(?:we|i)\s+(?:do\s+business|work)\s+with\b/i,
      /\blist\s+(?:our|my|all)\s+vendors?\b/i,
      /\bwho\s+are\s+(?:our|my)\s+(?:vendors?|suppliers?|providers?)\b/i,
    ],
    intent: "chat",
    baseConfidence: 0.92,
  },
  {
    name: "chat_focus",
    patterns: [
      /\bwhat\s+should\s+(?:I|we)\s+focus\s+on\b/i,
      /\bwhat\s+needs?\s+(?:my\s+)?attention\b/i,
      /\bwhat(?:'s|\s+is)\s+pending\b/i,
      /\bany(?:thing)?\s+(?:that\s+)?needs?\s+(?:review|attention|action)\b/i,
    ],
    intent: "chat",
    baseConfidence: 0.90,
  },
  {
    name: "chat_spending",
    patterns: [
      /\bwhere\s+(?:does|did|is)\s+(?:my|our)\s+money\s+go\b/i,
      /\b(?:biggest|largest|top)\s+(?:expenses?|spending|costs?)\b/i,
      /\bspending\s+(?:breakdown|overview|summary)\b/i,
      /\bbreak(?:\s+)?down\s+(?:my|our)\s+(?:spending|expenses?|costs?)\b/i,
    ],
    intent: "chat",
    baseConfidence: 0.90,
  },

  // === RAG INTENT (relationship/analysis questions) ===
  {
    name: "rag_relationship",
    patterns: [
      /\btell\s+(?:me\s+)?about\s+(?:our\s+)?(?:relationship|history|dealings)\s+with\b/i,
      /\bwhat\s+(?:do|did)\s+(?:we|i)\s+(?:know|have)\s+(?:about|on|with)\b/i,
      /\bsummar(?:y|ize)\s+(?:all\s+)?(?:our\s+)?(?:dealings?|transactions?|history|relationship)\s+(?:with|for)\b/i,
      /\bsummar(?:y|ize)\s+.{0,30}(?:with|for|about)\s+\w+/i,
      /\bgive\s+(?:me\s+)?(?:a|an)\s+(?:summary|overview|rundown)\b/i,
      /^summar(?:y|ize)\s*$/i,
    ],
    intent: "rag",
    baseConfidence: 0.85,
  },
  {
    name: "rag_analysis",
    patterns: [
      /\banalyze\b/i,
      /\bcompare\s+(?:\w+\s+)?(?:invoices?|receipts?|documents?)\b/i,
      /\bwhat\s+(?:trends?|patterns?)\b/i,
      /\bexplain\s+(?:the\s+)?(?:differences?|changes?)\b/i,
      /\bwhat\s+vendors?\s+(?:do|did|have)\s+(?:we|i)\b/i,
      /\bwhich\s+vendors?\s+(?:do|did|have)\s+(?:we|i)\b/i,
      /\boverview\s+of\s+(?:our\s+)?(?:vendors?|documents?|invoices?)\b/i,
      /\bhistory\s+of\s+(?:invoices?|receipts?|documents?)\b/i,
    ],
    intent: "rag",
    baseConfidence: 0.85,
  },

  // === SEARCH INTENT (find/list documents) ===
  {
    name: "search_natural",
    patterns: [
      /\b(?:can|could|would)\s+you\s+(?:find|search|look\s+for|get|show|pull\s+up)\b/i,
      /\b(?:i\s+need|i'm\s+looking|looking)\s+(?:to\s+find|for)\b/i,
      /\bdo\s+(?:you|we)\s+have\s+(?:any|a|the)?\s*(?:files?|documents?|invoices?|receipts?)/i,
      /\bwhere\s+(?:is|are)\s+(?:the|my|our)\s+(?:\w+\s+)?(?:files?|documents?|invoices?|receipts?)/i,
      /\bpull\s+up\b/i,
    ],
    intent: "search",
    baseConfidence: 0.90,
  },
  {
    name: "search_explicit",
    patterns: [
      /^(?:find|search|look\s+for|locate|get|retrieve)\s+/i,
      /\bshow\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:invoices?|receipts?|documents?|contracts?|bank\s*statements?)\b/i,
      /\blist\s+(?:all\s+)?(?:the\s+)?(?:invoices?|receipts?|documents?|bank\s*statements?|contracts?)\b/i,
      /\b(?:find|get|show)\s+(?:me\s+)?(?:all\s+)?(?:\w+\s+)?(?:from|for|by)\s+/i,
    ],
    intent: "search",
    baseConfidence: 0.95,
    extractSlots: (query) => {
      const slots: Partial<Slots> = {};
      // Extract comparison if present (e.g., "invoices over $500")
      if (/\b(?:over|above|greater|more)\s+(?:than\s+)?\$?(\d+)/i.test(query)) {
        const match = query.match(/\b(?:over|above|greater|more)\s+(?:than\s+)?\$?(\d+(?:\.\d{2})?)/i);
        if (match) {
          slots.comparison = "greater";
          slots.comparisonValue = parseFloat(match[1]);
        }
      } else if (/\b(?:under|below|less|fewer)\s+(?:than\s+)?\$?(\d+)/i.test(query)) {
        const match = query.match(/\b(?:under|below|less|fewer)\s+(?:than\s+)?\$?(\d+(?:\.\d{2})?)/i);
        if (match) {
          slots.comparison = "less";
          slots.comparisonValue = parseFloat(match[1]);
        }
      }
      return slots;
    },
  },
  {
    name: "search_filter",
    patterns: [
      /\b(?:invoices?|receipts?|documents?|contracts?)\s+(?:from|for|by|with|over|under|above|below)\s+/i,
      /\b(?:invoices?|receipts?|documents?)\s+(?:greater|less|more|fewer)\s+than\b/i,
    ],
    intent: "search",
    baseConfidence: 0.9,
    extractSlots: (query) => {
      const slots: Partial<Slots> = {};
      // Extract comparison
      if (/\b(?:over|above|greater|more)\s+(?:than\s+)?\$?(\d+)/i.test(query)) {
        const match = query.match(/\b(?:over|above|greater|more)\s+(?:than\s+)?\$?(\d+(?:\.\d{2})?)/i);
        if (match) {
          slots.comparison = "greater";
          slots.comparisonValue = parseFloat(match[1]);
        }
      } else if (/\b(?:under|below|less|fewer)\s+(?:than\s+)?\$?(\d+)/i.test(query)) {
        const match = query.match(/\b(?:under|below|less|fewer)\s+(?:than\s+)?\$?(\d+(?:\.\d{2})?)/i);
        if (match) {
          slots.comparison = "less";
          slots.comparisonValue = parseFloat(match[1]);
        }
      }
      return slots;
    },
  },
  {
    name: "search_vendor",
    patterns: [
      /\b(?:from|by)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/,
      /\b([A-Z][a-zA-Z]+)\s+(?:invoices?|receipts?|documents?)\b/,
    ],
    intent: "search",
    baseConfidence: 0.85,
  },

  // === FALLBACK: Document type only ===
  {
    name: "search_doc_type_only",
    patterns: [
      /^(?:invoices?|receipts?|bank\s*statements?|contracts?|tax\s*forms?)$/i,
    ],
    intent: "search",
    baseConfidence: 0.6, // Low confidence - single word queries need clarification
  },
];

/**
 * Match query against rules and return best match
 */
export function matchRules(query: string, slots: Slots): RuleMatch | null {
  const normalizedQuery = query.trim().toLowerCase();

  for (const rule of RULES) {
    if (rule.intent === "sum" && hasSpecificDocumentIndicator(query, slots)) {
      continue;
    }
    for (const pattern of rule.patterns) {
      const match = query.match(pattern);
      if (match) {
        // Analytics guard: skip search_natural for analysis/trend queries → let model classify as rag/sum
        if (rule.name === "search_natural" && /\b(?:trend|pattern|money\s+flow|over\s+time|why|compar|analy)/i.test(query)) {
          continue;
        }
        // Calculate confidence boost based on slots
        let confidenceBoost = 0;

        // Having relevant slots increases confidence
        if (slots.documentType) confidenceBoost += 0.05;
        if (slots.vendor || slots.semanticText.length > 3) confidenceBoost += 0.03;
        if (slots.year || slots.date) confidenceBoost += 0.02;

        // Extract additional slots from rule if defined
        const additionalSlots = rule.extractSlots?.(query, match) || {};

        return {
          intent: rule.intent,
          confidence: Math.min(1.0, rule.baseConfidence + confidenceBoost),
          reasoning: `Matched rule "${rule.name}" with pattern`,
          additionalSlots,
        };
      }
    }
  }

  return null;
}

/**
 * Detect short fragment follow-ups like "the Bega one"
 */
export function isFragmentFollowUp(query: string): boolean {
  const trimmed = query.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 5) return false;

  if (/^(?:the|that|this)\s+one$/i.test(trimmed)) return true;
  if (/^(?:the|that|this)\s+\w+(?:\s+\w+)?\s+one$/i.test(trimmed)) return true;

  return false;
}

/**
 * Infer intent from slots when no rule matches
 * Returns lower confidence since this is a fallback
 */
export function inferIntentFromSlots(slots: Slots): RuleMatch | null {
  // If we have document type or vendor, likely a search
  if (slots.documentType || slots.vendor) {
    return {
      intent: "search",
      confidence: 0.6,
      reasoning: "Inferred search intent from document type or vendor slot",
    };
  }

  // If we have date/year and semantic text, could be search or rag
  if ((slots.year || slots.date) && slots.semanticText.length > 5) {
    return {
      intent: "search",
      confidence: 0.5,
      reasoning: "Inferred search intent from date and semantic text",
    };
  }

  // If semantic text with document-specific slots, try rag
  if (slots.semanticText.length > 10 && (slots.vendor || slots.documentType)) {
    return {
      intent: "rag",
      confidence: 0.4,
      reasoning: "Fallback to RAG for query with document-specific slots",
    };
  }

  // General unrecognized query → chat (above clarification threshold)
  return {
    intent: "chat",
    confidence: slots.semanticText.length > 10 ? 0.7 : 0.75,
    reasoning: "No document-specific slots, defaulting to chat",
  };
}

/**
 * Check if query looks like a question
 */
export function isQuestion(query: string): boolean {
  const questionPatterns = [
    /^(?:what|who|when|where|why|how|which|can|could|would|is|are|do|does|did)\b/i,
    /\?$/,
  ];
  return questionPatterns.some((p) => p.test(query.trim()));
}

/**
 * Check if query contains aggregation keywords
 */
export function hasAggregationKeyword(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return Object.keys(AGGREGATION_PATTERNS).some((kw) => lowerQuery.includes(kw));
}
