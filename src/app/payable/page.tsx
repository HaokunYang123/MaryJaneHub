"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

// Demo data for accounts payable
const bills = [
    { vendor: 'Apex Security', description: 'Monthly security service', amount: 3400, dueDate: '2024-03-05', status: 'overdue', category: 'Security' },
    { vendor: 'City of Phoenix', description: 'Utilities - February', amount: 890, dueDate: '2024-03-10', status: 'pending', category: 'Utilities' },
    { vendor: 'Nutrient Pro', description: 'Growing supplies', amount: 2150, dueDate: '2024-03-12', status: 'pending', category: 'Supplies' },
    { vendor: 'Green Packaging Co', description: 'Retail packaging', amount: 1800, dueDate: '2024-03-15', status: 'pending', category: 'Supplies' },
    { vendor: 'AZ Business Insurance', description: 'Q1 Premium', amount: 4500, dueDate: '2024-03-20', status: 'scheduled', category: 'Insurance' },
    { vendor: 'Desert Commercial RE', description: 'March rent - Phoenix', amount: 8500, dueDate: '2024-03-01', status: 'paid', category: 'Rent' },
    { vendor: 'Elite Marketing', description: 'Social media campaign', amount: 3200, dueDate: '2024-03-08', status: 'pending', category: 'Marketing' },
    { vendor: 'Thompson Legal', description: 'Compliance consulting', amount: 2750, dueDate: '2024-03-18', status: 'pending', category: 'Professional Services' },
];

export default function PayablePage() {
    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Accounts Payable</h2>
                            <p className="text-slate-500 text-sm mt-1">Manage vendor bills and payments across all entities</p>
                        </div>
                        <div className="flex gap-2">
                            <a href="/bills" className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold">
                                <span className="material-symbols-outlined text-sm">add</span> Upload Invoice
                            </a>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Total Due</p>
                            <p className="text-2xl font-black text-slate-800">$27,190</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-xs text-red-600 font-bold uppercase">Overdue</p>
                            <p className="text-2xl font-black text-red-700">$3,400</p>
                        </div>
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                            <p className="text-xs text-orange-600 font-bold uppercase">Due This Week</p>
                            <p className="text-2xl font-black text-orange-700">$8,040</p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                            <p className="text-xs text-green-600 font-bold uppercase">Paid This Month</p>
                            <p className="text-2xl font-black text-green-700">$8,500</p>
                        </div>
                    </div>

                    {/* Bills Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">All Bills</h3>
                            <span className="text-xs bg-slate-200 px-2 py-1 rounded font-bold">{bills.length} ITEMS</span>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">Vendor</th>
                                    <th className="px-6 py-3 text-left font-semibold">Category</th>
                                    <th className="px-6 py-3 text-left font-semibold">Due Date</th>
                                    <th className="px-6 py-3 text-right font-semibold">Amount</th>
                                    <th className="px-6 py-3 text-center font-semibold">Status</th>
                                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {bills.map((bill, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-6 py-4">
                                            <p className="font-medium">{bill.vendor}</p>
                                            <p className="text-xs text-slate-400">{bill.description}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-xs font-bold">
                                                {bill.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{bill.dueDate}</td>
                                        <td className="px-6 py-4 text-right font-bold">${bill.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${bill.status === 'overdue' ? 'bg-red-100 text-red-600' :
                                                    bill.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                                                        bill.status === 'scheduled' ? 'bg-blue-100 text-blue-600' :
                                                            'bg-green-100 text-green-600'
                                                }`}>
                                                {bill.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {bill.status !== 'paid' && (
                                                <button className="px-3 py-1 bg-[#1B5E20] text-white rounded font-bold text-xs">
                                                    PAY
                                                </button>
                                            )}
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
