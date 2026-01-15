"use client";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { PayrollCard } from "@/components/dashboard/payroll-card";

// Demo payroll data
const employees = [
    { name: 'Maria Garcia', role: 'Dispensary Manager - Phoenix', salary: 5200, status: 'active', hoursThisPeriod: 86 },
    { name: 'James Wilson', role: 'Cultivation Lead', salary: 4800, status: 'active', hoursThisPeriod: 80 },
    { name: 'Sarah Chen', role: 'Compliance Officer', salary: 5500, status: 'active', hoursThisPeriod: 80 },
    { name: 'Michael Brown', role: 'Budtender - Phoenix', salary: 2800, status: 'active', hoursThisPeriod: 72 },
    { name: 'Emily Rodriguez', role: 'Budtender - Phoenix', salary: 2800, status: 'active', hoursThisPeriod: 80 },
    { name: 'David Lee', role: 'Inventory Specialist', salary: 3200, status: 'active', hoursThisPeriod: 80 },
    { name: 'Ashley Martinez', role: 'Dispensary Manager - Tucson', salary: 5200, status: 'active', hoursThisPeriod: 84 },
    { name: 'Robert Taylor', role: 'Security Lead', salary: 3600, status: 'active', hoursThisPeriod: 88 },
];

export default function PayrollPage() {
    const totalPayroll = employees.reduce((sum, e) => sum + e.salary, 0);

    return (
        <div className="bg-white text-slate-900 h-screen flex flex-col overflow-hidden">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6 scroll-smooth">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Payroll Management</h2>
                            <p className="text-slate-500 text-sm mt-1">Manage employee compensation across all entities</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm">
                                <span className="material-symbols-outlined text-sm">download</span> Export Payroll
                            </button>
                            <button className="flex items-center gap-2 px-4 py-2 bg-[#FFB300] text-slate-900 rounded-lg text-sm font-bold shadow-lg">
                                <span className="material-symbols-outlined text-sm">check</span> Run Payroll
                            </button>
                        </div>
                    </div>

                    {/* Payroll Cycle Card */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <PayrollCard />
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-slate-800 mb-4">Quick Stats</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase">Total Liability</p>
                                    <p className="text-2xl font-black text-slate-800">${totalPayroll.toLocaleString()}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase">Active Employees</p>
                                    <p className="text-2xl font-black text-slate-800">{employees.length}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase">YTD Payroll</p>
                                    <p className="text-2xl font-black text-slate-800">$136,840</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 font-bold uppercase">Next Payroll</p>
                                    <p className="text-xl font-black text-[#1B5E20]">March 15</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Employee List */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold">Employee Roster</h3>
                            <button className="text-xs font-bold text-[#1B5E20] flex items-center uppercase">
                                Add Employee <span className="material-symbols-outlined text-sm">add</span>
                            </button>
                        </div>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                                    <th className="px-6 py-3 text-left font-semibold">Employee</th>
                                    <th className="px-6 py-3 text-left font-semibold">Role</th>
                                    <th className="px-6 py-3 text-center font-semibold">Hours</th>
                                    <th className="px-6 py-3 text-right font-semibold">Salary</th>
                                    <th className="px-6 py-3 text-center font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {employees.map((emp, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="size-8 rounded-full bg-[#1B5E20] flex items-center justify-center text-white text-xs font-bold">
                                                    {emp.name.split(' ').map(n => n[0]).join('')}
                                                </div>
                                                <span className="font-medium">{emp.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{emp.role}</td>
                                        <td className="px-6 py-4 text-center">{emp.hoursThisPeriod}h</td>
                                        <td className="px-6 py-4 text-right font-bold">${emp.salary.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-xs font-bold">
                                                ACTIVE
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
