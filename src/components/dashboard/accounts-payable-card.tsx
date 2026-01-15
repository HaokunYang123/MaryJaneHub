export function AccountsPayableCard() {
    return (
        <div className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white/50">
                <h3 className="font-bold text-sm">Accounts Payable</h3>
                <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-bold">8 PENDING</span>
            </div>
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="text-slate-400 bg-slate-50/50">
                            <th className="px-4 py-2 font-semibold">VENDOR</th>
                            <th className="px-4 py-2 font-semibold text-right">DUE</th>
                            <th className="px-4 py-2 font-semibold text-right">ACTION</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        <tr>
                            <td className="px-4 py-3">
                                <p className="font-medium">Apex Security</p>
                                <p className="text-[10px] text-slate-400">Inv #4492</p>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-[#D32F2F]">-$3,400</td>
                            <td className="px-4 py-3 text-right">
                                <button className="px-3 py-1 bg-[#1B5E20] text-white rounded font-bold text-[10px]">PAY</button>
                            </td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3">
                                <p className="font-medium">City of Phoenix</p>
                                <p className="text-[10px] text-slate-400">Utilities</p>
                            </td>
                            <td className="px-4 py-3 text-right font-bold">-$890</td>
                            <td className="px-4 py-3 text-right">
                                <button className="px-3 py-1 bg-[#1B5E20] text-white rounded font-bold text-[10px]">PAY</button>
                            </td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3">
                                <p className="font-medium">Nutrient Pro</p>
                                <p className="text-[10px] text-slate-400">Inv #221</p>
                            </td>
                            <td className="px-4 py-3 text-right font-bold">-$2,150</td>
                            <td className="px-4 py-3 text-right">
                                <button className="px-3 py-1 bg-[#1B5E20] text-white rounded font-bold text-[10px]">PAY</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="p-3 bg-slate-50/80 mt-auto">
                <p className="text-[10px] text-slate-400 text-center mb-1">Weekly total: $14,230.00</p>
            </div>
        </div>
    );
}
