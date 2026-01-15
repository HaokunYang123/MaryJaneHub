export function AccountsReceivableCard() {
    return (
        <div className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white/50">
                <h3 className="font-bold text-sm">Accounts Receivable</h3>
                <button className="text-[10px] font-bold text-[#1B5E20] flex items-center">
                    VIEW ALL <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </button>
            </div>
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="text-slate-400 bg-slate-50/50">
                            <th className="px-4 py-2 font-semibold">ENTITY</th>
                            <th className="px-4 py-2 font-semibold text-right">AMOUNT</th>
                            <th className="px-4 py-2 font-semibold text-center">OVERDUE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        <tr>
                            <td className="px-4 py-3 font-medium">Green Relief LLC</td>
                            <td className="px-4 py-3 text-right font-bold">$12,450</td>
                            <td className="px-4 py-3 text-center">
                                <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">14d</span>
                            </td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-medium">Bud & Bloom</td>
                            <td className="px-4 py-3 text-right font-bold">$8,200</td>
                            <td className="px-4 py-3 text-center">
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-bold">5d</span>
                            </td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-medium">High Desert AZ</td>
                            <td className="px-4 py-3 text-right font-bold">$4,120</td>
                            <td className="px-4 py-3 text-center">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full font-bold">1d</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="p-3 bg-slate-50/80 mt-auto">
                <button className="w-full py-2 bg-white border border-[#1B5E20]/20 text-[#1B5E20] text-[11px] font-black rounded-lg uppercase tracking-wider hover:bg-[#1B5E20] hover:text-white transition-all">
                    Send 12 Reminders
                </button>
            </div>
        </div>
    );
}
