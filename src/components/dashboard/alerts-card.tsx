export function AlertsCard() {
    return (
        <div className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#D32F2F]">report</span> Critical Alerts
                </h3>
                <span className="text-[10px] text-slate-400">LAST 24H</span>
            </div>
            <div className="space-y-3 flex-1">
                <div className="flex items-start gap-3 p-2 bg-red-50 rounded-lg border-l-4 border-[#D32F2F]">
                    <span className="material-symbols-outlined text-[#D32F2F] text-sm mt-0.5">error</span>
                    <div>
                        <p className="text-xs font-bold text-red-900">Reconciliation Error</p>
                        <p className="text-[10px] text-red-700/70">Chase Entity-B mismatch: -$4,200.00</p>
                    </div>
                </div>
                <div className="flex items-start gap-3 p-2 bg-orange-50 rounded-lg border-l-4 border-[#F57C00]">
                    <span className="material-symbols-outlined text-[#F57C00] text-sm mt-0.5">warning</span>
                    <div>
                        <p className="text-xs font-bold text-orange-900">Low Balance Warning</p>
                        <p className="text-[10px] text-orange-700/70">Payroll Account #402 below threshold</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 p-2 border-b border-slate-100">
                    <span className="material-symbols-outlined text-slate-400 text-sm">schedule</span>
                    <p className="text-xs text-slate-600">Inventory sync delayed (AZ Disp-1)</p>
                </div>
                <div className="flex items-center gap-3 p-2 border-b border-slate-100">
                    <span className="material-symbols-outlined text-slate-400 text-sm">schedule</span>
                    <p className="text-xs text-slate-600">Pending lease payment for Mar-01</p>
                </div>
                <div className="flex items-center gap-3 p-2">
                    <span className="material-symbols-outlined text-slate-400 text-sm">task_alt</span>
                    <p className="text-xs text-slate-400">All entity filings current</p>
                </div>
            </div>
        </div>
    );
}
