"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { AnimatedCurrency } from "@/components/ui/animated-number";

interface QuickBooksBill {
    Id: string;
    VendorRef?: { name: string; value: string };
    DueDate: string;
    TotalAmt: number;
    Balance: number;
    DocNumber?: string;
    Line?: Array<{
        Description?: string;
        Amount: number;
        AccountBasedExpenseLineDetail?: {
            AccountRef?: { name: string };
        };
    }>;
    TxnDate?: string;
}

interface DisplayBill {
    id: string;
    vendor: string;
    description: string;
    amount: number;
    dueDate: string;
    status: 'overdue' | 'pending' | 'scheduled' | 'paid';
    category: string;
    docNumber?: string;
}

export default function PayablePage() {
    const [isVisible, setIsVisible] = useState(false);
    const [bills, setBills] = useState<DisplayBill[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const [summaryData, setSummaryData] = useState({
        totalDue: 0,
        overdue: 0,
        dueThisWeek: 0,
        paidThisMonth: 0
    });
    const pageRef = useRef<HTMLDivElement>(null);

    // Check QuickBooks connection and fetch bills
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Check connection status
                const statusRes = await fetch('/api/auth/quickbooks?action=status');
                const statusData = await statusRes.json();
                setIsConnected(statusData.authenticated);

                if (statusData.authenticated) {
                    // Fetch bills from QuickBooks
                    const billsRes = await fetch('/api/quickbooks/bills');
                    const billsData = await billsRes.json();

                    if (billsData.bills) {
                        const today = new Date();
                        const oneWeekFromNow = new Date(today);
                        oneWeekFromNow.setDate(today.getDate() + 7);
                        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

                        // Transform QuickBooks bills to display format
                        const transformedBills: DisplayBill[] = billsData.bills.map((bill: QuickBooksBill) => {
                            const dueDate = new Date(bill.DueDate);
                            const isPaid = bill.Balance === 0;
                            const isOverdue = !isPaid && dueDate < today;
                            const isDueThisWeek = !isPaid && !isOverdue && dueDate <= oneWeekFromNow;

                            let status: DisplayBill['status'] = 'pending';
                            if (isPaid) status = 'paid';
                            else if (isOverdue) status = 'overdue';
                            else if (isDueThisWeek) status = 'scheduled';

                            // Get description from line items
                            const description = bill.Line?.find(l => l.Description)?.Description || 'Invoice';

                            // Get category from account
                            const category = bill.Line?.find(l => l.AccountBasedExpenseLineDetail?.AccountRef?.name)
                                ?.AccountBasedExpenseLineDetail?.AccountRef?.name || 'Miscellaneous';

                            return {
                                id: bill.Id,
                                vendor: bill.VendorRef?.name || 'Unknown Vendor',
                                description,
                                amount: bill.TotalAmt,
                                dueDate: bill.DueDate,
                                status,
                                category,
                                docNumber: bill.DocNumber
                            };
                        });

                        setBills(transformedBills);

                        // Calculate summary
                        let totalDue = 0;
                        let overdue = 0;
                        let dueThisWeek = 0;
                        let paidThisMonth = 0;

                        billsData.bills.forEach((bill: QuickBooksBill) => {
                            const dueDate = new Date(bill.DueDate);
                            const txnDate = bill.TxnDate ? new Date(bill.TxnDate) : null;
                            const isPaid = bill.Balance === 0;

                            if (!isPaid) {
                                totalDue += bill.Balance || bill.TotalAmt;
                                if (dueDate < today) {
                                    overdue += bill.Balance || bill.TotalAmt;
                                } else if (dueDate <= oneWeekFromNow) {
                                    dueThisWeek += bill.Balance || bill.TotalAmt;
                                }
                            } else if (txnDate && txnDate >= startOfMonth) {
                                paidThisMonth += bill.TotalAmt;
                            }
                        });

                        setSummaryData({ totalDue, overdue, dueThisWeek, paidThisMonth });
                    }
                }
            } catch (error) {
                console.error('Failed to fetch bills:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setIsVisible(true);
            },
            { threshold: 0.1 }
        );
        if (pageRef.current) observer.observe(pageRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main ref={pageRef} className="flex-1 overflow-y-auto bg-slate-50 p-6">
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

                    {/* Not Connected Warning */}
                    {isConnected === false && !isLoading && (
                        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3">
                            <span className="material-symbols-outlined text-orange-600">link_off</span>
                            <div className="flex-1">
                                <p className="font-semibold text-orange-800">QuickBooks Not Connected</p>
                                <p className="text-sm text-orange-600">Connect QuickBooks to see your actual bills and invoices.</p>
                            </div>
                            <a href="/settings" className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-bold hover:bg-orange-700">
                                Connect
                            </a>
                        </div>
                    )}

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                            <p className="text-xs text-slate-400 font-bold uppercase">Total Due</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">
                                {isLoading ? (
                                    <span className="animate-pulse bg-slate-200 rounded h-8 w-24 inline-block"></span>
                                ) : isVisible ? (
                                    <AnimatedCurrency value={summaryData.totalDue} duration={1400} />
                                ) : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-red-50 border border-red-200 rounded-xl p-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
                            <p className="text-xs text-red-600 font-bold uppercase">Overdue</p>
                            <p className="text-2xl font-black text-red-700 tabular-nums">
                                {isLoading ? (
                                    <span className="animate-pulse bg-red-200 rounded h-8 w-24 inline-block"></span>
                                ) : isVisible ? (
                                    <AnimatedCurrency value={summaryData.overdue} duration={1400} delay={100} />
                                ) : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-orange-50 border border-orange-200 rounded-xl p-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
                            <p className="text-xs text-orange-600 font-bold uppercase">Due This Week</p>
                            <p className="text-2xl font-black text-orange-700 tabular-nums">
                                {isLoading ? (
                                    <span className="animate-pulse bg-orange-200 rounded h-8 w-24 inline-block"></span>
                                ) : isVisible ? (
                                    <AnimatedCurrency value={summaryData.dueThisWeek} duration={1400} delay={200} />
                                ) : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-green-50 border border-green-200 rounded-xl p-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '300ms' }}>
                            <p className="text-xs text-green-600 font-bold uppercase">Paid This Month</p>
                            <p className="text-2xl font-black text-green-700 tabular-nums">
                                {isLoading ? (
                                    <span className="animate-pulse bg-green-200 rounded h-8 w-24 inline-block"></span>
                                ) : isVisible ? (
                                    <AnimatedCurrency value={summaryData.paidThisMonth} duration={1400} delay={300} />
                                ) : '$0.00'}
                            </p>
                        </div>
                    </div>

                    {/* Bills Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col" style={{ maxHeight: 'calc(100vh - 380px)' }}>
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
                            <h3 className="font-bold flex items-center gap-2">
                                All Bills
                                {isConnected && (
                                    <span className="text-xs text-green-600 font-normal flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">cloud_done</span>
                                        Synced with QuickBooks
                                    </span>
                                )}
                            </h3>
                            <span className="text-xs bg-slate-200 px-2 py-1 rounded font-bold">{bills.length} ITEMS</span>
                        </div>

                        {isLoading ? (
                            <div className="p-12 text-center">
                                <div className="animate-spin size-8 border-4 border-[#1B5E20] border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="text-slate-500">Loading bills from QuickBooks...</p>
                            </div>
                        ) : bills.length === 0 ? (
                            <div className="p-12 text-center">
                                <span className="material-symbols-outlined text-4xl text-slate-300 mb-2">receipt_long</span>
                                <p className="text-slate-500 font-medium">No bills found</p>
                                <p className="text-slate-400 text-sm mt-1">
                                    {isConnected ? 'Upload invoices to create bills' : 'Connect QuickBooks to see your bills'}
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-y-auto flex-1">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 z-10">
                                    <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                        <th className="px-6 py-3 text-left font-semibold bg-slate-50">Vendor</th>
                                        <th className="px-6 py-3 text-left font-semibold bg-slate-50">Category</th>
                                        <th className="px-6 py-3 text-left font-semibold bg-slate-50">Due Date</th>
                                        <th className="px-6 py-3 text-right font-semibold bg-slate-50">Amount</th>
                                        <th className="px-6 py-3 text-center font-semibold bg-slate-50">Status</th>
                                        <th className="px-6 py-3 text-right font-semibold bg-slate-50">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {bills.map((bill, idx) => (
                                        <tr
                                            key={bill.id}
                                            className={`hover:bg-slate-50 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                                            style={{ transitionDelay: `${400 + idx * 60}ms` }}
                                        >
                                            <td className="px-6 py-4">
                                                <p className="font-medium">{bill.vendor}</p>
                                                <p className="text-xs text-slate-400">{bill.description}</p>
                                                {bill.docNumber && (
                                                    <p className="text-xs text-slate-300">#{bill.docNumber}</p>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-xs font-bold">
                                                    {bill.category}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">{bill.dueDate}</td>
                                            <td className="px-6 py-4 text-right font-bold tabular-nums">
                                                {isVisible ? <AnimatedCurrency value={bill.amount} duration={1000} delay={400 + idx * 60} /> : '$0.00'}
                                            </td>
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
                        )}
                    </div>
                </main>
            </div>
            <Footer />
        </div>
    );
}
