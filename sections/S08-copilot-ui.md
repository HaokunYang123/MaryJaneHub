# S08 — AI Copilot UI

## Status: Done

## Intent

Provide a persistent AI copilot sidebar (AiRail) for conversational interaction with business documents. Display chat messages, source cards linking to documents, and suggested prompts. Support multi-turn conversation with markdown rendering.

**Success criteria:** User can ask questions in the sidebar, see formatted answers with source cards, click a source to open the document in the preview drawer, and continue multi-turn conversations with context preserved.

**Non-goals:** Voice input. File attachment in chat. Copilot outside the main app shell.

## Contract

**ContractVersion: v1**

### AiRail component

Persistent right sidebar in the app shell. Togglable open/close.

**API integration:**
- Calls `POST /api/assistant/chat` with message + conversation context
- Receives: type (answer/clarification/error), message, sources, updated context

**UI elements:**
- Chat input with send button
- Message bubbles (user + assistant, markdown rendered via ReactMarkdown)
- Source cards: document type icon, vendor, date, total, snippet — clickable to open preview
- Suggested prompts (shown when conversation is empty)
- Loading state during API call

### AiRailProvider

React context providing:
```typescript
{
  isOpen: boolean,
  toggle: () => void,
  width: number,
  previewDocument: Document | null,
  openPreview: (doc: Document) => void
}
```

### Source cards

Only shown for type="answer" responses. Each card:
- Document type badge
- Vendor name
- Date + total
- Snippet of matching text
- Click → opens document in preview drawer (communicates with S07)

## Proof

1. Sending a message shows a user bubble and then an assistant bubble with the response.
2. Source cards appear below answer messages and show document metadata.
3. Clicking a source card opens the document preview drawer.
4. Conversation context is passed to subsequent messages, enabling follow-up questions.
5. Suggested prompts are shown on empty conversation and hidden after first message.

## Depends On

- S06 (assistant API contract)

## Files

- `components/layout/AiRail.tsx` — copilot sidebar
- `components/layout/AiRailProvider.tsx` — context provider
- `components/layout/ai-rail-types.ts` — types
- `components/layout/AppShell.tsx` — app shell (hosts AiRail)
