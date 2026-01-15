"use client";

export function AiSidebar() {
    return (
        <aside className="w-80 border-l border-slate-200 bg-white hidden xl:flex flex-col shadow-2xl relative z-10">
            <div className="p-6 border-b border-slate-100">
                <div className="flex items-center gap-3 mb-1">
                    <div className="size-8 bg-[#1B5E20] rounded-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-lg">auto_awesome</span>
                    </div>
                    <h3 className="font-black text-lg tracking-tight">AI Assistant</h3>
                </div>
                <p className="text-xs text-slate-400">Your financial co-pilot is active.</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="flex flex-col gap-3">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] font-bold text-[#1B5E20] uppercase mb-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">history</span> History
                        </p>
                        <p className="text-xs text-slate-600 italic">&quot;How does my cash flow compare to last March?&quot;</p>
                    </div>

                    <div className="space-y-4 pt-2">
                        <div className="flex gap-2 items-start max-w-[90%]">
                            <div className="size-6 rounded-full bg-slate-200 shrink-0 flex items-center justify-center text-[10px] font-bold text-slate-600">AR</div>
                            <div className="bg-slate-100 p-2.5 rounded-xl rounded-tl-none">
                                <p className="text-xs text-slate-700">Are there any missing invoices from Green Relief?</p>
                            </div>
                        </div>

                        <div className="flex gap-2 items-start flex-row-reverse max-w-[90%] ml-auto">
                            <div className="size-6 rounded-full bg-[#1B5E20] shrink-0 flex items-center justify-center">
                                <span className="material-symbols-outlined text-white text-[14px]">auto_awesome</span>
                            </div>
                            <div className="bg-[#1B5E20]/5 p-2.5 rounded-xl rounded-tr-none border border-[#1B5E20]/10">
                                <p className="text-xs text-slate-700">I found 2 un-synced invoices from February. Would you like me to import them into the Ledger?</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-3 px-1">Suggested Actions</p>
                    <div className="space-y-2">
                        <button className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#1B5E20] hover:bg-[#1B5E20]/5 transition-all flex items-center gap-2 group">
                            <span className="material-symbols-outlined text-sm text-slate-400 group-hover:text-[#1B5E20]">summarize</span>
                            <span className="text-xs font-semibold text-slate-700">Summarize P&L</span>
                        </button>
                        <button className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#1B5E20] hover:bg-[#1B5E20]/5 transition-all flex items-center gap-2 group">
                            <span className="material-symbols-outlined text-sm text-slate-400 group-hover:text-[#1B5E20]">search</span>
                            <span className="text-xs font-semibold text-slate-700">Find missing invoices</span>
                        </button>
                        <button className="w-full text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#1B5E20] hover:bg-[#1B5E20]/5 transition-all flex items-center gap-2 group">
                            <span className="material-symbols-outlined text-sm text-slate-400 group-hover:text-[#1B5E20]">analytics</span>
                            <span className="text-xs font-semibold text-slate-700">Predict Tax Liability</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white">
                <div className="relative">
                    <input
                        className="w-full pl-3 pr-10 py-3 bg-slate-100 border-none rounded-xl text-xs focus:ring-2 focus:ring-[#1B5E20]/20 placeholder:text-slate-400 outline-none"
                        placeholder="Ask about files, P&L, or data..."
                        type="text"
                    />
                    <button className="absolute right-2 top-1.5 p-1.5 bg-[#1B5E20] text-white rounded-lg shadow-lg shadow-[#1B5E20]/20">
                        <span className="material-symbols-outlined text-sm">send</span>
                    </button>
                </div>
            </div>
        </aside>
    );
}
