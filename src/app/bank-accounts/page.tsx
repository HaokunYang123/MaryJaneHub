"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

// Demo bank accounts data
const accounts = [
    { bank: 'Chase Business', name: 'Main Operating - Phoenix', accountNum: '****4521', balance: 312450, type: 'Checking', entity: 'Mary\'s Dispensary LLC' },
    { bank: 'Chase Business', name: 'Payroll Account', accountNum: '****4522', balance: 89200, type: 'Checking', entity: 'Mary\'s Dispensary LLC' },
    { bank: 'Wells Fargo', name: 'Operating - Tucson', accountNum: '****7891', balance: 145800, type: 'Checking', entity: 'Desert Bloom AZ LLC' },
    { bank: 'Chase Business', name: 'Tax Reserve', accountNum: '****4523', balance: 334353, type: 'Savings', entity: 'Mary\'s Holdings LLC' },
    { bank: 'Bank of America', name: 'Working Capital', accountNum: '****2234', balance: 67500, type: 'Checking', entity: 'Mary\'s Real Estate LLC' },
    { bank: 'US Bank', name: 'Cultivation Ops', accountNum: '****5567', balance: 28900, type: 'Checking', entity: 'AZ Grow Co LLC' },
];

export default function BankAccountsPage() {
    const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
    const checkingTotal = accounts.filter(a => a.type === 'Checking').reduce((sum, a) => sum + a.balance, 0);
    const savingsTotal = accounts.filter(a => a.type === 'Savings').reduce((sum, a) => sum + a.balance, 0);

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Bank Accounts</h2>
                            <p className="text-slate-500 text-sm mt-1">Consolidated view of all entity bank accounts</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm">
                                <span className="material-symbols-outlined text-sm">sync</span> Sync Balances
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg">
                                <span className="material-symbols-outlined text-sm">add</span> Link Account
                            </button>
                        </div>
                    </div>

                    {/* Balance Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-[#1B5E20] text-white rounded-xl p-6 shadow-lg">
                            <p className="text-xs text-white/60 font-bold uppercase">Total Balance</p>
                            <p className="text-4xl font-black mt-1">${totalBalance.toLocaleString()}</p>
                            <p className="text-xs text-green-300 mt-2">+12.4% from last month</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Checking Accounts</p>
                            <p className="text-3xl font-black text-slate-800 mt-1">${checkingTotal.toLocaleString()}</p>
                            <p className="text-xs text-slate-400 mt-2">{accounts.filter(a => a.type === 'Checking').length} accounts</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Savings / Reserves</p>
                            <p className="text-3xl font-black text-slate-800 mt-1">${savingsTotal.toLocaleString()}</p>
                            <p className="text-xs text-slate-400 mt-2">{accounts.filter(a => a.type === 'Savings').length} accounts</p>
                        </div>
                    </div>

                    {/* Accounts List */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">All Accounts</h3>
                            <span className="text-xs bg-slate-200 px-2 py-1 rounded font-bold">{accounts.length} LINKED</span>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">Bank</th>
                                    <th className="px-6 py-3 text-left font-semibold">Account Name</th>
                                    <th className="px-6 py-3 text-left font-semibold">Entity</th>
                                    <th className="px-6 py-3 text-center font-semibold">Type</th>
                                    <th className="px-6 py-3 text-right font-semibold">Balance</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {accounts.map((acc, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-slate-600 text-lg">account_balance</span>
                                                </div>
                                                <span className="font-medium">{acc.bank}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="font-medium">{acc.name}</p>
                                            <p className="text-xs text-slate-400">{acc.accountNum}</p>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{acc.entity}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${acc.type === 'Savings' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {acc.type}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-lg">${acc.balance.toLocaleString()}</td>
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
