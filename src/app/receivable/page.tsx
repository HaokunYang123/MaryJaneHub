"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

// Demo data for accounts receivable
const invoices = [
    { customer: 'Green Relief LLC', description: 'Wholesale order #4521', amount: 12450, dueDate: '2024-02-20', overdueDays: 14, status: 'overdue' },
    { customer: 'Bud & Bloom', description: 'Wholesale order #4489', amount: 8200, dueDate: '2024-02-28', overdueDays: 5, status: 'overdue' },
    { customer: 'High Desert AZ', description: 'Wholesale order #4510', amount: 4120, dueDate: '2024-03-04', overdueDays: 1, status: 'due-soon' },
    { customer: 'Sedona Wellness', description: 'Wholesale order #4532', amount: 6800, dueDate: '2024-03-10', overdueDays: 0, status: 'pending' },
    { customer: 'Flagstaff Dispensary', description: 'Wholesale order #4498', amount: 15200, dueDate: '2024-03-15', overdueDays: 0, status: 'pending' },
    { customer: 'Mesa Medical', description: 'Wholesale order #4511', amount: 9400, dueDate: '2024-02-15', overdueDays: 0, status: 'paid' },
];

export default function ReceivablePage() {
    const totalDue = invoices.filter(i => i.status !== 'paid').reduce((sum, i) => sum + i.amount, 0);
    const overdue = invoices.filter(i => i.status === 'overdue').reduce((sum, i) => sum + i.amount, 0);

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Accounts Receivable</h2>
                            <p className="text-slate-500 text-sm mt-1">Track customer invoices and payments</p>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold">
                            <span className="material-symbols-outlined text-sm">mail</span> Send All Reminders
                        </button>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Total Receivable</p>
                            <p className="text-2xl font-black text-[#FFB300]">${totalDue.toLocaleString()}</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <p className="text-xs text-red-600 font-bold uppercase">Overdue</p>
                            <p className="text-2xl font-black text-red-700">${overdue.toLocaleString()}</p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                            <p className="text-xs text-green-600 font-bold uppercase">Collected This Month</p>
                            <p className="text-2xl font-black text-green-700">$9,400</p>
                        </div>
                    </div>

                    {/* Invoices Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">Outstanding Invoices</h3>
                            <button className="text-xs font-bold text-[#1B5E20] flex items-center uppercase">
                                View All <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">Customer</th>
                                    <th className="px-6 py-3 text-left font-semibold">Description</th>
                                    <th className="px-6 py-3 text-right font-semibold">Amount</th>
                                    <th className="px-6 py-3 text-center font-semibold">Status</th>
                                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoices.map((invoice, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium">{invoice.customer}</td>
                                        <td className="px-6 py-4 text-slate-600">{invoice.description}</td>
                                        <td className="px-6 py-4 text-right font-bold">${invoice.amount.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            {invoice.status === 'overdue' && (
                                                <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-bold">
                                                    {invoice.overdueDays}d overdue
                                                </span>
                                            )}
                                            {invoice.status === 'due-soon' && (
                                                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-bold">
                                                    Due soon
                                                </span>
                                            )}
                                            {invoice.status === 'pending' && (
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-bold">
                                                    Pending
                                                </span>
                                            )}
                                            {invoice.status === 'paid' && (
                                                <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full font-bold">
                                                    Paid
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {invoice.status !== 'paid' && (
                                                <button className="px-3 py-1 bg-slate-100 text-slate-700 rounded font-bold text-xs hover:bg-slate-200">
                                                    REMIND
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
