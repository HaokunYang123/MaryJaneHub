"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useAiRail } from "./AiRailProvider";
import type { FactPair, SearchResult, SourceContext } from "./ai-rail-types";

type ConversationContext = {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  pendingClarification?: {
    originalQuery: string;
    originalIntent: "search" | "single_qa" | "sum" | "rag";
    question: string;
    timestamp: number;
  };
};

type AssistantChatApiResponse = {
  success: boolean;
  data?: {
    type: "answer" | "clarification" | "error";
    intent: "search" | "single_qa" | "sum" | "rag";
    message: string;
    sources: SearchResult[];
    context: ConversationContext;
    auditRequestId: string | null;
  };
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  query?: string;
  sources?: SearchResult[];
};

const INITIAL_MESSAGE: ChatMessage = {
  id: "assistant-initial",
  role: "assistant",
  text: "I stay here across pages. Ask about your business or ask me to find files.",
};

const SUGGESTED_PROMPTS = [
  "Find invoices from Centerpointe",
  "How much did we spend in 2025?",
  "Show files pending review",
  "Summarize vendor spend this month",
];

function toDisplay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function getExtractionData(extraction?: Record<string, unknown>): Record<string, unknown> {
  if (!extraction) return {};
  const nested = extraction.data;
  if (nested && typeof nested === "object") {
    return nested as Record<string, unknown>;
  }
  return extraction;
}

function getResultFacts(extraction?: Record<string, unknown>): FactPair[] {
  const data = getExtractionData(extraction);
  const candidates: Array<{ key: string; label: string }> = [
    { key: "invoice_number", label: "Invoice #" },
    { key: "date", label: "Date" },
    { key: "invoice_date", label: "Invoice Date" },
    { key: "vendor", label: "Vendor" },
    { key: "merchant_name", label: "Merchant" },
    { key: "total", label: "Total Amount" },
    { key: "amount", label: "Amount" },
  ];

  const output: FactPair[] = [];
  for (const candidate of candidates) {
    const value = toDisplay(data[candidate.key]);
    if (!value) continue;
    if (output.some((item) => item.label === candidate.label)) continue;
    output.push({ label: candidate.label, value });
    if (output.length >= 4) break;
  }
  return output;
}

function buildSearchNarrative(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `No files found for "${query}". Try vendor, invoice number, date, or a phrase from the document.`;
  }
  return `Found ${results.length} relevant file${results.length > 1 ? "s" : ""} for "${query}".`;
}

function pickToken(result: SearchResult): string | null {
  const token = result.highlight?.match || result.highlight?.query || null;
  if (!token) return null;
  const clean = token.trim();
  return clean.length > 0 ? clean : null;
}

export default function AiRail() {
  const { railOpen, setRailOpen, railWidth, openDocumentPreview } = useAiRail();
  const [query, setQuery] = useState("");
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [conversationContext, setConversationContext] = useState<ConversationContext>({
    history: [],
  });
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const userNearBottom = useRef(true);

  useEffect(() => {
    const node = messagesRef.current;
    if (!node) return;
    if (userNearBottom.current) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, railOpen]);

  function handleMessagesScroll(): void {
    const node = messagesRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    userNearBottom.current = distanceFromBottom < 80;
  }

  async function runSearch(input: string): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed || thinking) return;

    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", text: trimmed }]);
    setThinking(true);
    setQuery("");

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          message: trimmed,
          context: conversationContext,
          mode: "owner",
        }),
      });
      const payload = (await response.json()) as AssistantChatApiResponse;

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || "Assistant request failed.");
      }

      const data = payload.data;
      setConversationContext(data.context);

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: data.message || buildSearchNarrative(trimmed, data.sources || []),
          query: trimmed,
          sources: data.sources || [],
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant request failed.";
      setConversationContext({ history: [] });
      setMessages((prev) => [
        ...prev,
        { id: `assistant-error-${Date.now()}`, role: "assistant", text: `Error: ${message}` },
      ]);
    } finally {
      setThinking(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void runSearch(query);
  }

  function openFromSource(source: SearchResult, sourceQuery: string): void {
    const context: SourceContext = {
      query: sourceQuery,
      fileName: source.fileName,
      quote: source.highlight?.quote || null,
      token: pickToken(source),
      page: source.highlight?.page || null,
      coords: source.highlight?.coords || null,
      facts: getResultFacts(source.extraction),
    };
    openDocumentPreview(source.id, context);
  }

  return (
    <aside
      className={`relative z-40 flex shrink-0 flex-col border-l border-slate-200 bg-white text-slate-900 transition-all duration-300 ${
        railOpen ? "w-[390px]" : "w-14"
      }`}
      style={{ width: `${railWidth}px` }}
    >
      {railOpen ? (
        <>
          <div className="border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-black tracking-tight text-slate-900">AI Copilot</p>
                <p className="text-xs text-slate-500">Always-on assistant</p>
              </div>
              <button
                type="button"
                onClick={() => setRailOpen(false)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-100"
                aria-label="Collapse AI panel"
              >
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </div>
          </div>

          <div ref={messagesRef} onScroll={handleMessagesScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div
                  className={`rounded-2xl p-3 text-sm whitespace-pre-wrap ${
                    message.role === "user"
                      ? "ml-6 bg-slate-100 text-slate-900 shadow-sm"
                      : "mr-6 border border-slate-200 bg-white text-slate-900 shadow-sm"
                  }`}
                >
                  {message.text}
                </div>

                {message.sources && message.sources.length > 0 ? (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                    <div className="flex items-center gap-2 px-1">
                      <span className="material-symbols-outlined text-sm text-[var(--brand-green)]">data_object</span>
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-green)]">
                        Sources ({message.sources.length})
                      </p>
                    </div>

                    {message.sources.map((source) => {
                      const facts = getResultFacts(source.extraction);
                      return (
                        <button
                          key={`${message.id}-${source.id}`}
                          type="button"
                          onClick={() => openFromSource(source, message.query || "")}
                          className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-green)]/50 hover:bg-emerald-50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-xs font-semibold text-slate-900">{source.fileName}</p>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {(source.score ?? source.similarity ?? 0).toFixed(3)}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-slate-500">
                            <span>{source.documentType || "other"}</span>
                            {source.duplicateCount && source.duplicateCount > 0 ? (
                              <span>+{source.duplicateCount} duplicate</span>
                            ) : null}
                          </div>
                          {facts.length > 0 ? (
                            <div className="mt-2 space-y-0.5">
                              {facts.map((fact) => (
                                <p key={`${source.id}-${fact.label}-${fact.value}`} className="text-[11px] text-slate-700">
                                  <span className="font-semibold text-slate-900">{fact.label}:</span> {fact.value}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void runSearch(prompt)}
                  disabled={thinking}
                  className="rounded-full border border-slate-200 px-2 py-1 text-[11px] text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 disabled:opacity-40"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <label htmlFor="global-ai-query" className="mb-1 block text-xs text-slate-500">
                Ask the copilot
              </label>
              <div className="flex gap-2">
                <input
                  id="global-ai-query"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Ask about business or files..."
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--brand-green)]"
                />
                <button
                  type="submit"
                  disabled={thinking || query.trim().length === 0}
                  className="rounded-xl bg-[var(--brand-green)] px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {thinking ? "..." : "Ask"}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-start gap-3 border-l border-slate-200 pt-3">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Open AI panel"
          >
            <span className="material-symbols-outlined text-base">chevron_left</span>
          </button>
          <div className="rotate-180 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 [writing-mode:vertical-rl]">
            AI
          </div>
        </div>
      )}
    </aside>
  );
}
