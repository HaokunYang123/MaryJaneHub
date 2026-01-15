"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

// Demo inventory data
const inventory = [
    { sku: 'FL-001', strain: 'Blue Dream', type: 'Flower - Bulk', quantity: 1240, unit: 'g', value: 31000, location: 'Phoenix' },
    { sku: 'FL-002', strain: 'OG Kush', type: 'Flower - Bulk', quantity: 980, unit: 'g', value: 24500, location: 'Phoenix' },
    { sku: 'FL-003', strain: 'Girl Scout Cookies', type: 'Flower - Bulk', quantity: 860, unit: 'g', value: 21500, location: 'Tucson' },
    { sku: 'FL-004', strain: 'Sour Diesel', type: 'Flower - Bulk', quantity: 720, unit: 'g', value: 18000, location: 'Phoenix' },
    { sku: 'PKG-001', strain: 'Blue Dream', type: 'Pre-packaged 3.5g', quantity: 245, unit: 'units', value: 12250, location: 'Phoenix' },
    { sku: 'PKG-002', strain: 'OG Kush', type: 'Pre-packaged 3.5g', quantity: 198, unit: 'units', value: 9900, location: 'Phoenix' },
    { sku: 'EDI-001', strain: 'Assorted', type: 'Edibles', quantity: 320, unit: 'units', value: 4800, location: 'Both' },
    { sku: 'CON-001', strain: 'Live Resin', type: 'Concentrates', quantity: 89, unit: 'g', value: 4450, location: 'Phoenix' },
];

export default function InventoryPage() {
    const totalFlower = inventory.filter(i => i.type.includes('Flower')).reduce((sum, i) => sum + i.quantity, 0);
    const totalUnits = inventory.filter(i => i.unit === 'units').reduce((sum, i) => sum + i.quantity, 0);
    const totalValue = inventory.reduce((sum, i) => sum + i.value, 0);

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Cannabis Inventory</h2>
                            <p className="text-slate-500 text-sm mt-1">Real-time METRC-synced inventory across all locations</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm">
                                <span className="material-symbols-outlined text-sm">sync</span> Sync METRC
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg">
                                <span className="material-symbols-outlined text-sm">add</span> Add Product
                            </button>
                        </div>
                    </div>

                    {/* Inventory Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined text-[#1B5E20]">eco</span>
                                <p className="text-xs text-slate-400 font-bold uppercase">Total Flower</p>
                            </div>
                            <p className="text-2xl font-black text-slate-800">{totalFlower.toLocaleString()}g</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Retail Units</p>
                            <p className="text-2xl font-black text-slate-800">{totalUnits.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Total Value</p>
                            <p className="text-2xl font-black text-[#FFB300]">${totalValue.toLocaleString()}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Capacity Used</p>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-[#FFB300]" style={{ width: '72%' }}></div>
                                </div>
                                <span className="text-sm font-bold">72%</span>
                            </div>
                        </div>
                    </div>

                    {/* Inventory Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">Current Stock</h3>
                            <div className="flex gap-2">
                                <span className="px-2 py-1 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-xs font-bold">Phoenix</span>
                                <span className="px-2 py-1 bg-[#FFB300]/10 text-[#FFB300] rounded text-xs font-bold">Tucson</span>
                            </div>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">SKU</th>
                                    <th className="px-6 py-3 text-left font-semibold">Product</th>
                                    <th className="px-6 py-3 text-left font-semibold">Type</th>
                                    <th className="px-6 py-3 text-center font-semibold">Quantity</th>
                                    <th className="px-6 py-3 text-right font-semibold">Value</th>
                                    <th className="px-6 py-3 text-center font-semibold">Location</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {inventory.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{item.sku}</td>
                                        <td className="px-6 py-4 font-medium">{item.strain}</td>
                                        <td className="px-6 py-4 text-slate-600">{item.type}</td>
                                        <td className="px-6 py-4 text-center font-bold">{item.quantity} {item.unit}</td>
                                        <td className="px-6 py-4 text-right font-bold">${item.value.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${item.location === 'Phoenix' ? 'bg-[#1B5E20]/10 text-[#1B5E20]' :
                                                    item.location === 'Tucson' ? 'bg-[#FFB300]/10 text-[#FFB300]' :
                                                        'bg-slate-100 text-slate-600'
                                                }`}>
                                                {item.location}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>
            <Footer />
        </div>
    );
}
