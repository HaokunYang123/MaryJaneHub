export function InventoryCard() {
    return (
        <div className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1B5E20]">eco</span> Inventory Status
                </h3>
                <span className="px-2 py-0.5 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-[10px] font-black uppercase tracking-widest">Arizona Sales</span>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-3 bg-white rounded-lg shadow-sm border border-slate-100">
                    <p className="text-2xl font-black text-slate-800">4,280<span className="text-xs text-slate-400 ml-1">g</span></p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Flower Bulk</p>
                </div>
                <div className="text-center p-3 bg-white rounded-lg shadow-sm border border-slate-100">
                    <p className="text-2xl font-black text-slate-800">842</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Retail Units</p>
                </div>
            </div>
            <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Retail Value</span>
                    <span className="font-bold">$124,500</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FFB300]" style={{ width: "72%" }}></div>
                </div>
                <p className="text-[10px] text-slate-400 text-right">Capacity: 72% used</p>
            </div>
            <button className="mt-auto w-full py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors">
                Manage METRC Sync
            </button>
        </div>
    );
}
