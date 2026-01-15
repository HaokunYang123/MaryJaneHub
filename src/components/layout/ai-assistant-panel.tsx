"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AssistantMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    insights?: {
        pnl?: { revenue: number; expenses: number; netIncome: number; period: string };
        ghosts?: { count: number; samples?: { name: string; amount: number; date: string }[] };
        approvals?: { pending: number; duplicates: number };
        cash?: { projected: number; bankBalance: number; billsDue: number; invoicesDue: number };
    };
    actions?: { label: string; prompt: string }[];
};

type AssistantPanelProps = {
    variant?: "sidebar" | "modal";
    onClose?: () => void;
};

const suggestedActions = [
    { label: "Summarize P&L", prompt: "Summarize the P&L for this month." },
    { label: "Find ghost transactions", prompt: "Find missing transactions between bank and QuickBooks." },
    { label: "Show pending approvals", prompt: "Show pending document approvals." },
    { label: "Project cash availability", prompt: "What is projected available cash for the next 7 days?" },
];

function formatCurrency(value: number) {
    return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function AiAssistantPanel({ variant = "sidebar", onClose }: AssistantPanelProps) {
    const [messages, setMessages] = useState<AssistantMessage[]>([
        {
            id: "welcome",
            role: "assistant",
            content:
                "Hi Mary! I can summarize P&L, surface ghost transactions, and prep approvals. Ask me anything about cash flow, invoices, or documents.",
        },
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const SpeechRecognition = (window as typeof window & {
            SpeechRecognition?: typeof window.SpeechRecognition;
            webkitSpeechRecognition?: typeof window.SpeechRecognition;
        }).SpeechRecognition || (window as typeof window & {
            webkitSpeechRecognition?: typeof window.SpeechRecognition;
        }).webkitSpeechRecognition;

        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const transcript = event.results?.[0]?.[0]?.transcript || "";
            if (transcript) {
                setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
                inputRef.current?.focus();
            }
        };
        recognition.onend = () => setListening(false);
        recognition.onerror = () => setListening(false);

        recognitionRef.current = recognition;
    }, []);

    const canUseVoice = Boolean(recognitionRef.current);

    const historyPayload = useMemo(
        () => messages.map((message) => ({ role: message.role, content: message.content })),
        [messages]
    );

    const sendMessage = async (content: string) => {
        const trimmed = content.trim();
        if (!trimmed || loading) return;

        const userMessage: AssistantMessage = {
            id: `${Date.now()}-user`,
            role: "user",
            content: trimmed,
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch("/api/assistant", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: trimmed,
                    history: historyPayload.slice(-8),
                }),
            });
            const data = await response.json();
            const assistantMessage: AssistantMessage = {
                id: `${Date.now()}-assistant`,
                role: "assistant",
                content: data.reply || "I’m still getting set up. Try that again in a moment.",
                insights: data.insights,
                actions: data.actions,
            };
            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error) {
            console.error("[AI Assistant] Failed to respond", error);
            setMessages((prev) => [
                ...prev,
                {
                    id: `${Date.now()}-assistant`,
                    role: "assistant",
                    content: "I ran into an error reaching the AI service. Please try again.",
                },
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        sendMessage(input);
    };

    const toggleListening = () => {
        if (!recognitionRef.current) return;
        if (listening) {
            recognitionRef.current.stop();
        } else {
            setListening(true);
            recognitionRef.current.start();
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="size-8 bg-[#1B5E20] rounded-full flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-lg">auto_awesome</span>
                        </div>
                        <div>
                            <h3 className="font-black text-lg tracking-tight">AI Assistant</h3>
                            <p className="text-xs text-slate-400">Financial co-pilot for Mary’s Hub.</p>
                        </div>
                    </div>
                    {variant === "modal" && (
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600"
                            aria-label="Close AI panel"
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                    {suggestedActions.map((action) => (
                        <button
                            key={action.label}
                            onClick={() => sendMessage(action.prompt)}
                            className="px-2.5 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:border-[#1B5E20] hover:text-[#1B5E20] hover:bg-[#1B5E20]/5"
                        >
                            {action.label}
                        </button>
                    ))}
                </div>

                <div className="space-y-4">
                    {messages.map((message) => (
                        <div
                            key={message.id}
                            className={`flex gap-2 items-start ${message.role === "assistant" ? "" : "flex-row-reverse ml-auto"}`}
                        >
                            <div
                                className={`size-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${
                                    message.role === "assistant"
                                        ? "bg-[#1B5E20] text-white"
                                        : "bg-slate-200 text-slate-600"
                                }`}
                            >
                                {message.role === "assistant" ? (
                                    <span className="material-symbols-outlined text-white text-[14px]">auto_awesome</span>
                                ) : (
                                    "ME"
                                )}
                            </div>
                            <div
                                className={`max-w-[85%] rounded-xl p-3 text-xs ${
                                    message.role === "assistant"
                                        ? "bg-[#1B5E20]/5 border border-[#1B5E20]/10 text-slate-700"
                                        : "bg-slate-100 text-slate-700"
                                }`}
                            >
                                <p>{message.content}</p>
                                {message.insights?.pnl && (
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                                        <div className="bg-white/80 rounded-lg p-2 border border-slate-200">
                                            <p className="uppercase text-[10px] text-slate-400 font-bold">Revenue</p>
                                            <p className="font-semibold">{formatCurrency(message.insights.pnl.revenue)}</p>
                                        </div>
                                        <div className="bg-white/80 rounded-lg p-2 border border-slate-200">
                                            <p className="uppercase text-[10px] text-slate-400 font-bold">Net Income</p>
                                            <p className="font-semibold">{formatCurrency(message.insights.pnl.netIncome)}</p>
                                        </div>
                                    </div>
                                )}
                                {message.insights?.ghosts && (
                                    <div className="mt-2 text-[11px] text-slate-600">
                                        <p className="font-semibold text-[#D32F2F]">{message.insights.ghosts.count} ghost transactions detected.</p>
                                    </div>
                                )}
                                {message.insights?.approvals && (
                                    <div className="mt-2 text-[11px] text-slate-600">
                                        Pending approvals: {message.insights.approvals.pending} • Duplicates: {message.insights.approvals.duplicates}
                                    </div>
                                )}
                                {message.actions && message.actions.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {message.actions.map((action) => (
                                            <button
                                                key={action.label}
                                                onClick={() => sendMessage(action.prompt)}
                                                className="px-2.5 py-1.5 rounded-full border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-[#1B5E20] hover:text-[#1B5E20] hover:bg-[#1B5E20]/5"
                                            >
                                                {action.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100 bg-white">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={(event) => setInput(event.target.value)}
                            className="w-full pl-3 pr-10 py-3 bg-slate-100 border-none rounded-xl text-xs focus:ring-2 focus:ring-[#1B5E20]/20 placeholder:text-slate-400 outline-none"
                            placeholder="Ask about P&L, missing invoices, approvals..."
                            type="text"
                        />
                        {canUseVoice && (
                            <button
                                type="button"
                                onClick={toggleListening}
                                className={`absolute right-2 top-2 size-8 rounded-lg flex items-center justify-center ${
                                    listening ? "bg-[#D32F2F] text-white animate-pulse" : "bg-white text-[#1B5E20]"
                                }`}
                                aria-label={listening ? "Stop voice input" : "Start voice input"}
                            >
                                <span className="material-symbols-outlined text-sm">mic</span>
                            </button>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-3 py-3 bg-[#1B5E20] text-white rounded-lg shadow-lg shadow-[#1B5E20]/20 disabled:opacity-60"
                    >
                        <span className="material-symbols-outlined text-sm">{loading ? "hourglass_top" : "send"}</span>
                    </button>
                </div>
                {!canUseVoice && (
                    <p className="text-[10px] text-slate-400 mt-2">Voice input not supported in this browser.</p>
                )}
                {listening && <p className="text-[10px] text-[#D32F2F] mt-2">Listening… speak your request.</p>}
            </form>
        </div>
    );
}
