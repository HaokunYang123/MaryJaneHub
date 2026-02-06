"use client";

import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { AnimatedNumber, AnimatedCurrency } from "@/components/ui/animated-number";

// Demo tenant data
const tenants = [
    { name: 'Green Leaf Wellness', property: 'Phoenix Plaza - Suite 101', rent: 4500, dueDate: '2024-03-01', status: 'paid', lastPaid: '2024-02-28' },
    { name: 'AZ Botanicals', property: 'Phoenix Plaza - Suite 102', rent: 3800, dueDate: '2024-03-01', status: 'paid', lastPaid: '2024-03-01' },
    { name: 'Desert Remedies', property: 'Tucson Center - Unit A', rent: 5200, dueDate: '2024-03-05', status: 'pending', lastPaid: '2024-02-05' },
    { name: 'Cactus Cannabis', property: 'Tucson Center - Unit B', rent: 4800, dueDate: '2024-03-05', status: 'pending', lastPaid: '2024-02-04' },
    { name: 'Sonoran Herbs', property: 'Phoenix Plaza - Suite 103', rent: 3200, dueDate: '2024-02-15', status: 'overdue', lastPaid: '2024-01-15' },
];

export default function TenantPaymentsPage() {
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

    const totalMonthlyRent = tenants.reduce((sum, t) => sum + t.rent, 0);
    const collected = tenants.filter(t => t.status === 'paid').reduce((sum, t) => sum + t.rent, 0);
    const pending = tenants.filter(t => t.status !== 'paid').reduce((sum, t) => sum + t.rent, 0);

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main ref={pageRef} className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Tenant Payments</h2>
                            <p className="text-slate-500 text-sm mt-1">Track rent payments from commercial properties</p>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg">
                            <span className="material-symbols-outlined text-sm">mail</span> Send Reminders
                        </button>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <div className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                            <p className="text-xs text-slate-400 font-bold uppercase">Monthly Rent</p>
                            <p className="text-2xl font-black text-slate-800 tabular-nums">
                                {isVisible ? <AnimatedCurrency value={totalMonthlyRent} duration={1400} /> : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-green-50 border border-green-200 rounded-xl p-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
                            <p className="text-xs text-green-600 font-bold uppercase">Collected</p>
                            <p className="text-2xl font-black text-green-700 tabular-nums">
                                {isVisible ? <AnimatedCurrency value={collected} duration={1400} delay={100} /> : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-orange-50 border border-orange-200 rounded-xl p-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
                            <p className="text-xs text-orange-600 font-bold uppercase">Pending</p>
                            <p className="text-2xl font-black text-orange-700 tabular-nums">
                                {isVisible ? <AnimatedCurrency value={pending} duration={1400} delay={200} /> : '$0.00'}
                            </p>
                        </div>
                        <div className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '300ms' }}>
                            <p className="text-xs text-slate-400 font-bold uppercase">Properties</p>
                            <p className="text-2xl font-black text-slate-800">
                                {isVisible ? <><AnimatedNumber value={2} duration={1000} delay={300} /> locations</> : '0 locations'}
                            </p>
                        </div>
                    </div>

                    {/* Tenants Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">All Tenants</h3>
                            <span className="text-xs bg-slate-200 px-2 py-1 rounded font-bold">{tenants.length} TENANTS</span>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">Tenant</th>
                                    <th className="px-6 py-3 text-left font-semibold">Property</th>
                                    <th className="px-6 py-3 text-right font-semibold">Monthly Rent</th>
                                    <th className="px-6 py-3 text-center font-semibold">Due Date</th>
                                    <th className="px-6 py-3 text-center font-semibold">Status</th>
                                    <th className="px-6 py-3 text-right font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {tenants.map((tenant, idx) => (
                                    <tr key={idx} className={`hover:bg-slate-50 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`} style={{ transitionDelay: `${400 + idx * 80}ms` }}>
                                        <td className="px-6 py-4 font-medium">{tenant.name}</td>
                                        <td className="px-6 py-4 text-slate-600">{tenant.property}</td>
                                        <td className="px-6 py-4 text-right font-bold tabular-nums">
                                            {isVisible ? <AnimatedCurrency value={tenant.rent} duration={1000} delay={400 + idx * 80} /> : '$0.00'}
                                        </td>
                                        <td className="px-6 py-4 text-center">{tenant.dueDate}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${tenant.status === 'paid' ? 'bg-green-100 text-green-600' :
                                                    tenant.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                                                        'bg-red-100 text-red-600'
                                                }`}>
                                                {tenant.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {tenant.status !== 'paid' && (
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
