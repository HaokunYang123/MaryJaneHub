"use client";

import { AiAssistantPanel } from "./ai-assistant-panel";

export function AiSidebar() {
    return (
        <aside className="w-80 border-l border-slate-200 bg-white hidden xl:flex flex-col shadow-2xl relative z-10">
            <AiAssistantPanel />
        </aside>
    );
}
