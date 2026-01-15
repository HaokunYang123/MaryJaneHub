"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

interface PnLRow {
    name: string;
    value: number;
    type: 'header' | 'item' | 'total';
}

interface ConsolidatedPnL {
    totalRevenue: number;
    totalExpenses: number;
    breakdown: { entity: string; revenue: number }[];
}

const demoEntities = [
    { id: 'phx-001', label: 'Phoenix Retail' },
    { id: 'tuc-002', label: 'Tucson Retail' },
    { id: 'wh-003', label: 'Wholesale AZ' },
    { id: 'grow-004', label: 'Cultivation Ops' },
    { id: 'labs-005', label: 'Extraction Lab' },
    { id: 'log-006', label: 'Distribution' },
    { id: 're-007', label: 'Real Estate' },
    { id: 'hold-008', label: 'Holdings' },
];

export default function ReportsPage() {
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [consolidatedData, setConsolidatedData] = useState<ConsolidatedPnL | null>(null);
    const [authenticated, setAuthenticated] = useState<boolean | null>(null);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const entityIds = demoEntities.map((entity) => entity.id).join(',');
            const response = await fetch(
                `/api/quickbooks/reports/pnl?start_date=${startDate}&end_date=${endDate}&entityIds=${encodeURIComponent(entityIds)}`
            );
            const result = await response.json();

            if (result.error?.includes('Not authenticated')) {
                setAuthenticated(false);
            } else if (typeof result.totalRevenue === 'number') {
                setAuthenticated(true);
                setConsolidatedData(result);
            }
        } catch (error) {
            console.error('Error fetching report:', error);
        } finally {
            setLoading(false);
        }
    };

    // Demo data for when not connected
    const demoData: PnLRow[] = [
        { name: 'Income', value: 0, type: 'header' },
        { name: 'Dispensary Sales - Phoenix', value: 312000, type: 'item' },
        { name: 'Dispensary Sales - Tucson', value: 189000, type: 'item' },
        { name: 'Wholesale Revenue', value: 78000, type: 'item' },
        { name: 'Total Income', value: 579000, type: 'total' },
        { name: 'Cost of Goods Sold', value: 0, type: 'header' },
        { name: 'Inventory Purchases', value: 145000, type: 'item' },
        { name: 'Packaging & Supplies', value: 23000, type: 'item' },
        { name: 'Total COGS', value: 168000, type: 'total' },
        { name: 'Gross Profit', value: 411000, type: 'total' },
        { name: 'Operating Expenses', value: 0, type: 'header' },
        { name: 'Payroll (17 employees)', value: 68420, type: 'item' },
        { name: 'Rent & Facilities', value: 42000, type: 'item' },
        { name: 'Security (Apex Security)', value: 3400, type: 'item' },
        { name: 'Utilities', value: 4200, type: 'item' },
        { name: 'Insurance', value: 8900, type: 'item' },
        { name: 'Marketing', value: 12000, type: 'item' },
        { name: 'Professional Services', value: 6500, type: 'item' },
        { name: 'Total Operating Expenses', value: 145420, type: 'total' },
        { name: 'Net Operating Income', value: 265580, type: 'total' },
    ];

    const demoConsolidated: ConsolidatedPnL = {
        totalRevenue: 579000,
        totalExpenses: 313420,
        breakdown: [
            { entity: 'Phoenix Retail', revenue: 312000 },
            { entity: 'Tucson Retail', revenue: 189000 },
            { entity: 'Wholesale AZ', revenue: 78000 },
        ],
    };

    const entityLabelMap = useMemo(
        () => demoEntities.reduce<Record<string, string>>((acc, entity) => {
            acc[entity.id] = entity.label;
            return acc;
        }, {}),
        []
    );

    const displayConsolidated = consolidatedData || demoConsolidated;
    const displayData = demoData;
    const netProfit = displayConsolidated.totalRevenue - displayConsolidated.totalExpenses;
    const totalRevenue = Math.max(displayConsolidated.totalRevenue, 1);
    const chartSegments = displayConsolidated.breakdown.map((entry, index) => {
        const palette = [
            'bg-[#1B5E20]',
            'bg-[#1B5E20]/80',
            'bg-[#1B5E20]/60',
            'bg-slate-500',
            'bg-slate-400',
            'bg-slate-300',
            'bg-slate-200',
            'bg-slate-100',
        ];

        return {
            ...entry,
            label: entityLabelMap[entry.entity] || entry.entity,
            color: palette[index % palette.length],
            width: `${(entry.revenue / totalRevenue) * 100}%`,
        };
    });

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Profit & Loss Statement</h2>
                            <p className="text-slate-500 text-sm mt-1">Consolidated financial performance across all entities</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                />
                                <span className="text-slate-400">to</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
                                />
                            </div>
                            <button
                                onClick={fetchReport}
                                disabled={loading}
                                className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold"
                            >
                                <span className="material-symbols-outlined text-sm">refresh</span>
                                {loading ? 'Loading...' : 'Refresh'}
                            </button>
                        </div>
                    </div>

                    {authenticated === false && (
                        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-orange-500">warning</span>
                                <span className="text-sm text-orange-800">Connect to QuickBooks to see live data</span>
                            </div>
                            <a
                                href="/api/auth/quickbooks"
                                className="px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold"
                            >
                                Connect QuickBooks
                            </a>
                        </div>
                    )}

                    {/* Consolidated Revenue Stack */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-slate-900">Master P&amp;L Revenue Stack</h3>
                                <p className="text-xs text-slate-500">Aggregated revenue across all entities</p>
                            </div>
                            <span className="text-xs text-slate-400">{startDate} to {endDate}</span>
                        </div>
                        <div className="flex h-10 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-50">
                            {chartSegments.map((segment) => (
                                <div
                                    key={segment.label}
                                    className={`${segment.color} h-full`}
                                    style={{ width: segment.width }}
                                    title={`${segment.label}: $${segment.revenue.toLocaleString()}`}
                                />
                            ))}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                            {chartSegments.map((segment) => (
                                <div key={segment.label} className="flex items-center justify-between text-xs text-slate-600">
                                    <div className="flex items-center gap-2">
                                        <span className={`size-2 rounded-full ${segment.color}`} />
                                        <span className="font-semibold">{segment.label}</span>
                                    </div>
                                    <span>${segment.revenue.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* P&L Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold">Mary&apos;s Enterprises - All Entities</h3>
                            <span className="text-xs text-slate-400">{startDate} to {endDate}</span>
                        </div>
                        <table className="w-full">
                            <tbody>
                                {displayData.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        className={`
                      ${row.type === 'header' ? 'bg-slate-50 border-t border-b border-slate-100' : ''}
                      ${row.type === 'total' ? 'font-bold bg-slate-50/50' : ''}
                    `}
                                    >
                                        <td className={`px-6 py-3 ${row.type === 'header' ? 'font-bold text-slate-600 uppercase text-xs tracking-wider' : ''} ${row.type === 'item' ? 'pl-10' : ''}`}>
                                            {row.name}
                                        </td>
                                        <td className={`px-6 py-3 text-right ${row.type === 'header' ? '' : ''} ${row.name === 'Net Operating Income' || row.name === 'Net Income' ? 'text-[#1B5E20]' : ''}`}>
                                            {row.type !== 'header' && (
                                                <span>${row.value.toLocaleString()}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Total Revenue</p>
                            <p className="text-3xl font-black text-slate-800 mt-1">${displayConsolidated.totalRevenue.toLocaleString()}</p>
                            <p className="text-xs text-green-600 mt-2">+18.2% vs last period</p>
                        </div>
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <p className="text-xs text-slate-400 font-bold uppercase">Total Expenses</p>
                            <p className="text-3xl font-black text-slate-800 mt-1">${displayConsolidated.totalExpenses.toLocaleString()}</p>
                            <p className="text-xs text-red-600 mt-2">+12.4% vs last period</p>
                        </div>
                        <div className="bg-[#1B5E20] rounded-xl p-6 shadow-sm text-white">
                            <p className="text-xs text-white/60 font-bold uppercase">Net Profit</p>
                            <p className="text-3xl font-black mt-1">${netProfit.toLocaleString()}</p>
                            <p className="text-xs text-green-300 mt-2">+23.1% vs last period</p>
                        </div>
                    </div>
                </main>
            </div>
            <Footer />
        </div>
    );
}
