"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

// Demo alerts data
const alerts = [
    { type: 'error', title: 'Reconciliation Error', message: 'Chase Entity-B mismatch: -$4,200.00', time: '2 hours ago', entity: 'Mary\'s Dispensary LLC' },
    { type: 'warning', title: 'Low Balance Warning', message: 'Payroll Account #402 below threshold ($5,000)', time: '4 hours ago', entity: 'Mary\'s Dispensary LLC' },
    { type: 'warning', title: 'Invoice Overdue', message: 'Green Relief LLC - Invoice #4521 is 14 days overdue', time: '1 day ago', entity: 'Mary\'s Dispensary LLC' },
    { type: 'info', title: 'Inventory Sync Delayed', message: 'METRC sync for AZ Disp-1 pending for 3 hours', time: '3 hours ago', entity: 'Desert Bloom AZ LLC' },
    { type: 'info', title: 'Lease Payment Due', message: 'Pending lease payment for Mar-01 - $8,500', time: '5 hours ago', entity: 'Mary\'s Real Estate LLC' },
    { type: 'success', title: 'Bill Paid', message: 'Apex Security invoice #4492 marked as paid', time: '6 hours ago', entity: 'Mary\'s Dispensary LLC' },
    { type: 'success', title: 'Payroll Processed', message: 'February payroll completed for 17 employees', time: '2 days ago', entity: 'All Entities' },
];

export default function AlertsPage() {
    const critical = alerts.filter(a => a.type === 'error').length;
    const warnings = alerts.filter(a => a.type === 'warning').length;

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Alerts & Notifications</h2>
                            <p className="text-slate-500 text-sm mt-1">System alerts and action items across all entities</p>
                        </div>
                        <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold">
                            <span className="material-symbols-outlined text-sm">check</span> Mark All Read
                        </button>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-600">error</span>
                                <p className="text-xs text-red-600 font-bold uppercase">Critical</p>
                            </div>
                            <p className="text-3xl font-black text-red-700 mt-1">{critical}</p>
                        </div>
                        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-orange-600">warning</span>
                                <p className="text-xs text-orange-600 font-bold uppercase">Warnings</p>
                            </div>
                            <p className="text-3xl font-black text-orange-700 mt-1">{warnings}</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Total Alerts</p>
                            <p className="text-3xl font-black text-slate-800 mt-1">{alerts.length}</p>
                        </div>
                    </div>

                    {/* Alerts List */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">Recent Alerts</h3>
                            <span className="text-xs text-slate-400">LAST 7 DAYS</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {alerts.map((alert, idx) => (
                                <div key={idx} className={`p-4 flex items-start gap-4 hover:bg-slate-50 ${alert.type === 'error' ? 'border-l-4 border-red-500' :
                                        alert.type === 'warning' ? 'border-l-4 border-orange-500' :
                                            alert.type === 'success' ? 'border-l-4 border-green-500' :
                                                'border-l-4 border-blue-500'
                                    }`}>
                                    <span className={`material-symbols-outlined mt-0.5 ${alert.type === 'error' ? 'text-red-500' :
                                            alert.type === 'warning' ? 'text-orange-500' :
                                                alert.type === 'success' ? 'text-green-500' :
                                                    'text-blue-500'
                                        }`}>
                                        {alert.type === 'error' ? 'error' :
                                            alert.type === 'warning' ? 'warning' :
                                                alert.type === 'success' ? 'check_circle' :
                                                    'info'}
                                    </span>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="font-bold text-sm">{alert.title}</p>
                                            <span className="text-xs text-slate-400">{alert.time}</span>
                                        </div>
                                        <p className="text-sm text-slate-600 mt-1">{alert.message}</p>
                                        <span className="text-xs text-slate-400 mt-2 inline-block">{alert.entity}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            </div>
            <Footer />
        </div>
    );
}
