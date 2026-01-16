"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { AnimatedNumber, AnimatedCurrency } from "@/components/ui/animated-number";

// Demo sales data
const salesData = [
    { date: '2024-03-04', location: 'Phoenix Dispensary', transactions: 145, revenue: 12450, topProduct: 'Blue Dream 3.5g' },
    { date: '2024-03-03', location: 'Phoenix Dispensary', transactions: 132, revenue: 11200, topProduct: 'OG Kush 3.5g' },
    { date: '2024-03-02', location: 'Phoenix Dispensary', transactions: 158, revenue: 14100, topProduct: 'Edibles Variety' },
    { date: '2024-03-01', location: 'Phoenix Dispensary', transactions: 121, revenue: 10800, topProduct: 'Sour Diesel 3.5g' },
    { date: '2024-03-04', location: 'Tucson Dispensary', transactions: 98, revenue: 8200, topProduct: 'Girl Scout Cookies' },
    { date: '2024-03-03', location: 'Tucson Dispensary', transactions: 87, revenue: 7400, topProduct: 'Live Resin' },
];

const mtdRevenue = 312000;

export default function ArizonaSalesPage() {
    const [isVisible, setIsVisible] = useState(false);
    const pageRef = useRef<HTMLDivElement>(null);

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

    const todayRevenue = salesData.filter(s => s.date === '2024-03-04').reduce((sum, s) => sum + s.revenue, 0);
    const totalTransactions = salesData.filter(s => s.date === '2024-03-04').reduce((sum, s) => sum + s.transactions, 0);
    const avgTicket = Math.round(todayRevenue / totalTransactions);

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main ref={pageRef} className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Arizona Sales</h2>
                            <p className="text-slate-500 text-sm mt-1">Daily sales tracking for Arizona dispensaries</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm">
                                <span className="material-symbols-outlined text-sm">calendar_today</span> This Week
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg">
                                <span className="material-symbols-outlined text-sm">download</span> Export
                            </button>
                        </div>
                    </div>

                    {/* Sales Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className={`bg-[#FFB300] text-slate-900 rounded-xl p-4 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                            <p className="text-xs text-slate-700 font-bold uppercase">Today&apos;s Revenue</p>
                            <p className="text-3xl font-black tabular-nums">
                                {isVisible ? <AnimatedCurrency value={todayRevenue} duration={1400} /> : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
                            <p className="text-xs text-slate-400 font-bold uppercase">Transactions Today</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">
                                {isVisible ? <AnimatedNumber value={totalTransactions} duration={1200} delay={100} /> : '0'}
                            </p>
                        </div>
                        <div className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
                            <p className="text-xs text-slate-400 font-bold uppercase">Avg. Ticket</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">
                                {isVisible ? <AnimatedCurrency value={avgTicket} duration={1200} delay={200} /> : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '300ms' }}>
                            <p className="text-xs text-slate-400 font-bold uppercase">MTD Revenue</p>
                            <p className="text-2xl font-black text-[#1B5E20] tabular-nums">
                                {isVisible ? <AnimatedCurrency value={mtdRevenue} duration={1400} delay={300} /> : '$0.00'}
                            </p>
                        </div>
                    </div>

                    {/* Sales Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">Daily Sales Log</h3>
                            <div className="flex gap-2">
                                <span className="px-2 py-1 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-xs font-bold">Phoenix</span>
                                <span className="px-2 py-1 bg-[#FFB300]/10 text-[#FFB300] rounded text-xs font-bold">Tucson</span>
                            </div>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">Date</th>
                                    <th className="px-6 py-3 text-left font-semibold">Location</th>
                                    <th className="px-6 py-3 text-center font-semibold">Transactions</th>
                                    <th className="px-6 py-3 text-left font-semibold">Top Product</th>
                                    <th className="px-6 py-3 text-right font-semibold">Revenue</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {salesData.map((sale, idx) => (
                                    <tr key={idx} className={`hover:bg-slate-50 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`} style={{ transitionDelay: `${400 + idx * 80}ms` }}>
                                        <td className="px-6 py-4 font-medium">{sale.date}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${sale.location.includes('Phoenix') ? 'bg-[#1B5E20]/10 text-[#1B5E20]' : 'bg-[#FFB300]/10 text-[#FFB300]'
                                                }`}>
                                                {sale.location}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">{sale.transactions}</td>
                                        <td className="px-6 py-4 text-slate-600">{sale.topProduct}</td>
                                        <td className="px-6 py-4 text-right font-bold">${sale.revenue.toLocaleString()}</td>
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
