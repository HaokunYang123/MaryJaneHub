"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

// Demo reconciliation data
const reconciliations = [
    { account: 'Chase - Main Operating', entity: 'Mary\'s Dispensary LLC', bookBalance: 312450, bankBalance: 312450, difference: 0, status: 'matched' },
    { account: 'Chase - Payroll', entity: 'Mary\'s Dispensary LLC', bookBalance: 89200, bankBalance: 93400, difference: -4200, status: 'mismatch' },
    { account: 'Wells Fargo - Tucson', entity: 'Desert Bloom AZ LLC', bookBalance: 145800, bankBalance: 145800, difference: 0, status: 'matched' },
    { account: 'Chase - Tax Reserve', entity: 'Mary\'s Holdings LLC', bookBalance: 334353, bankBalance: 334353, difference: 0, status: 'matched' },
    { account: 'Bank of America', entity: 'Mary\'s Real Estate LLC', bookBalance: 67500, bankBalance: 67500, difference: 0, status: 'matched' },
    { account: 'US Bank', entity: 'AZ Grow Co LLC', bookBalance: 28900, bankBalance: 29150, difference: -250, status: 'pending' },
];

export default function ReconciliationPage() {
    const matched = reconciliations.filter(r => r.status === 'matched').length;
    const issues = reconciliations.filter(r => r.status !== 'matched').length;

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Reconciliation</h2>
                            <p className="text-slate-500 text-sm mt-1">Match book balances with bank statements</p>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg">
                            <span className="material-symbols-outlined text-sm">sync</span> Run Reconciliation
                        </button>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-green-600">check_circle</span>
                                <p className="text-xs text-green-600 font-bold uppercase">Matched</p>
                            </div>
                            <p className="text-3xl font-black text-green-700 mt-1">{matched} accounts</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-600">error</span>
                                <p className="text-xs text-red-600 font-bold uppercase">Issues Found</p>
                            </div>
                            <p className="text-3xl font-black text-red-700 mt-1">{issues} accounts</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Last Reconciled</p>
                            <p className="text-2xl font-black text-slate-800 mt-1">March 4, 2024</p>
                            <p className="text-xs text-slate-400">2 hours ago</p>
                        </div>
                    </div>

                    {/* Reconciliation Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">All Accounts</h3>
                            <span className="text-xs bg-slate-200 px-2 py-1 rounded font-bold">{reconciliations.length} ACCOUNTS</span>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">Account</th>
                                    <th className="px-6 py-3 text-left font-semibold">Entity</th>
                                    <th className="px-6 py-3 text-right font-semibold">Book Balance</th>
                                    <th className="px-6 py-3 text-right font-semibold">Bank Balance</th>
                                    <th className="px-6 py-3 text-right font-semibold">Difference</th>
                                    <th className="px-6 py-3 text-center font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {reconciliations.map((rec, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium">{rec.account}</td>
                                        <td className="px-6 py-4 text-slate-600">{rec.entity}</td>
                                        <td className="px-6 py-4 text-right">${rec.bookBalance.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right">${rec.bankBalance.toLocaleString()}</td>
                                        <td className={`px-6 py-4 text-right font-bold ${rec.difference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {rec.difference !== 0 ? `-$${Math.abs(rec.difference).toLocaleString()}` : '$0'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${rec.status === 'matched' ? 'bg-green-100 text-green-600' :
                                                    rec.status === 'mismatch' ? 'bg-red-100 text-red-600' :
                                                        'bg-orange-100 text-orange-600'
                                                }`}>
                                                {rec.status.toUpperCase()}
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
