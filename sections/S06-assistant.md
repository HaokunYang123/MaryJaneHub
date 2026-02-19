# S06 — AI Assistant

## Status: Done

## Intent

Provide a conversational AI interface for querying business documents. Route user queries to the correct handler via intent classification (5 intents). Support multi-turn conversations with context carry-over.

**Success criteria:** User asks natural language questions about their documents and gets accurate, sourced answers. Intent routing is correct 90%+ of the time via rules, with Gemini fallback for ambiguous cases. Follow-up questions retain context.

**Non-goals:** Document editing via chat. Multi-user conversation. Streaming responses.

## Contract

**ContractVersion: v1**

### POST /api/assistant/chat

Auth: `verifyAuth()`

```typescript
// Request
{
  message: string,
  context?: ConversationContext,   // prior turns for follow-ups
  mode?: "lawyer" | "owner"       // response style
}

// Response
{
  success: true,
  data: {
    type: "answer" | "clarification" | "error",
    intent: "search" | "single_qa" | "sum" | "rag" | "chat",
    message: string,
    sources: ChatSource[],        // only for type="answer"
    context: ConversationContext,  // pass back for next turn
    auditRequestId?: string
  }
}
```

### Intent types

| Intent | When | Example |
|--------|------|---------|
| search | Find/list documents | "Show me invoices from January" |
| single_qa | Question about one document's field | "What's the total on the ABC invoice?" |
| sum | Numerical aggregation | "Total spent on supplies this quarter" |
| rag | Synthesize across documents | "Summarize vendor relationships" |
| chat | General conversation | "Hello" / "What can you do?" |

### Routing

1. Rule-based pattern matching (handles ~90% of queries)
2. Slot extraction: date, vendor, amount, document type, semantic text
3. Confidence scoring: high ≥ 0.85, medium ≥ 0.7, low < 0.7
4. If confidence < 0.7: Gemini model classification fallback
5. If required slots missing: return type="clarification"

### Sources

Sources are included only when type="answer". Each source:
```typescript
{ documentId: string, documentType: string, snippet: string, score?: number }
```

## Proof

1. "Show me all invoices" routes to intent=search.
2. "How much did we spend on rent in 2025?" routes to intent=sum.
3. A follow-up "what about 2024?" retains the topic from the previous turn via context.
4. Ambiguous query that fails rule matching triggers Gemini fallback and still returns a valid intent.
5. Every assistant interaction creates an audit log entry with intent, confidence, and citation verification ratio.

## Depends On

- S05 (search for document retrieval)
- S01 (verifyAuth)
- ADR-004 (audit logging)

## Files

- `lib/assistant/router.ts` — intent classification engine
- `lib/assistant/rules.ts` — rule-based pattern matching
- `lib/assistant/search-handler.ts` — search intent handler
- `lib/assistant/single-qa.ts` — single document QA
- `lib/assistant/sum-handler.ts` — aggregation handler
- `lib/assistant/rag-handler.ts` — multi-document synthesis
- `lib/assistant/chat-handler.ts` — general conversation
- `lib/assistant/clarify.ts` — clarification flow
- `lib/assistant/messages.ts` — prompt templates
- `lib/assistant/types.ts`
- `app/api/assistant/chat/route.ts`
