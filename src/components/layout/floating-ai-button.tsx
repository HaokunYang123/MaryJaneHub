"use client";

import { useState } from "react";
import { AiAssistantPanel } from "./ai-assistant-panel";

export function FloatingAiButton() {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="fixed bottom-12 right-6 z-40 size-14 bg-white border-2 border-[#1B5E20] rounded-full shadow-2xl flex items-center justify-center group hover:scale-110 active:scale-95 transition-all xl:hidden"
                aria-label="Open AI assistant"
            >
                <span className="material-symbols-outlined text-[#1B5E20] text-3xl font-bold">auto_awesome</span>
                <div className="absolute -top-1 -right-1 size-4 bg-[#D32F2F] rounded-full border-2 border-white"></div>
                <span className="absolute right-16 bg-[#1B5E20] text-white text-[10px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap uppercase tracking-widest transition-opacity pointer-events-none">AI Hub Assistant</span>
            </button>

            {open && (
                <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center px-4 xl:hidden">
                    <div className="bg-white w-full max-w-md rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[85vh]">
                        <AiAssistantPanel variant="modal" onClose={() => setOpen(false)} />
                    </div>
                </div>
            )}
        </>
    );
}
