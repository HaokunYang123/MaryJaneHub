export function CashPositionCard() {
    return (
        <div className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl p-6 md:col-span-2 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[280px]">
            <div className="absolute top-0 right-0 w-32 h-full bg-[#1B5E20]/5 -skew-x-12 translate-x-16"></div>
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Aggregated Cash Position</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-[10px] font-black">+12.4% MoM</span>
                </div>
                <p className="text-5xl font-black text-[#FFB300] tracking-tighter mb-4">$847,293.00</p>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Operating Liquidity</p>
                        <p className="text-lg font-bold text-slate-700">$512,940</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Tax Reserves</p>
                        <p className="text-lg font-bold text-slate-700">$334,353</p>
                    </div>
                </div>
            </div>
            {/* Mini Bar Chart */}
            <div className="flex items-end gap-1.5 h-16 mt-6">
                <div className="flex-1 bg-slate-200 h-[60%] rounded-t-sm"></div>
                <div className="flex-1 bg-slate-200 h-[45%] rounded-t-sm"></div>
                <div className="flex-1 bg-slate-200 h-[80%] rounded-t-sm"></div>
                <div className="flex-1 bg-slate-200 h-[30%] rounded-t-sm"></div>
                <div className="flex-1 bg-[#1B5E20]/40 h-[90%] rounded-t-sm"></div>
                <div className="flex-1 bg-[#1B5E20]/60 h-[75%] rounded-t-sm"></div>
                <div className="flex-1 bg-[#1B5E20] h-[100%] rounded-t-sm"></div>
            </div>
        </div>
    );
}
