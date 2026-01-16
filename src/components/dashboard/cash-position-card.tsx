"use client";

import { useState, useEffect, useRef } from 'react';

const accounts = [
    { name: 'Main Operating - Phoenix', balance: 312450, type: 'Checking' },
    { name: 'Payroll Account', balance: 89200, type: 'Checking' },
    { name: 'Operating - Tucson', balance: 145800, type: 'Checking' },
    { name: 'Tax Reserve', balance: 334353, type: 'Savings' },
    { name: 'Working Capital', balance: 67500, type: 'Checking' },
    { name: 'Cultivation Ops', balance: 28900, type: 'Checking' },
];

const mockBills = [
    { id: 'bill-1', amount: 18500, dueDate: '2026-01-17', status: 'Open' },
    { id: 'bill-2', amount: 9200, dueDate: '2026-01-19', status: 'Open' },
    { id: 'bill-3', amount: 14600, dueDate: '2026-02-02', status: 'Open' },
];

const mockInvoices = [
    { id: 'inv-1', amount: 24100, dueDate: '2026-01-16', status: 'Open' },
    { id: 'inv-2', amount: 12800, dueDate: '2026-01-21', status: 'Open' },
    { id: 'inv-3', amount: 9800, dueDate: '2026-02-05', status: 'Open' },
];

function isWithinNextDays(dateString: string, days: number) {
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() + days);
    const target = new Date(dateString);
    return target >= today && target <= cutoff;
}

function formatCurrency(value: number) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Animated counter hook
function useCountUp(end: number, duration: number = 1500) {
    const [count, setCount] = useState(0);
    const [isVisible, setIsVisible] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !isVisible) {
                    setIsVisible(true);
                }
            },
            { threshold: 0.1 }
        );

        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible) return;

        let startTime: number;
        let animationFrame: number;

        const animate = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const progress = Math.min((currentTime - startTime) / duration, 1);

            // Easing function for smooth deceleration
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);
            setCount(Math.floor(easeOutQuart * end));

            if (progress < 1) {
                animationFrame = requestAnimationFrame(animate);
            } else {
                setCount(end);
            }
        };

        animationFrame = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrame);
    }, [end, duration, isVisible]);

    return { count, ref, isVisible };
}

export function CashPositionCard() {
    const totalBankBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
    const operatingLiquidity = accounts
        .filter((account) => account.type === 'Checking')
        .reduce((sum, account) => sum + account.balance, 0);
    const taxReserves = accounts
        .filter((account) => account.type === 'Savings')
        .reduce((sum, account) => sum + account.balance, 0);

    const openBillsDueSoon = mockBills
        .filter((bill) => bill.status === 'Open' && isWithinNextDays(bill.dueDate, 7))
        .reduce((sum, bill) => sum + bill.amount, 0);

    const openInvoicesDueSoon = mockInvoices
        .filter((invoice) => invoice.status === 'Open' && isWithinNextDays(invoice.dueDate, 7))
        .reduce((sum, invoice) => sum + invoice.amount, 0);

    const projectedAvailableCash = totalBankBalance - openBillsDueSoon + openInvoicesDueSoon;

    // Animated counters
    const { count: mainCount, ref: mainRef, isVisible } = useCountUp(totalBankBalance);
    const { count: opCount } = useCountUp(isVisible ? operatingLiquidity : 0, 1200);
    const { count: taxCount } = useCountUp(isVisible ? taxReserves : 0, 1200);
    const { count: projCount } = useCountUp(isVisible ? projectedAvailableCash : 0, 1200);

    const barHeights = [60, 45, 80, 30, 90, 75, 100];

    return (
        <div
            ref={mainRef}
            className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl p-6 md:col-span-2 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[280px]"
        >
            <div className="absolute top-0 right-0 w-32 h-full bg-[#1B5E20]/5 -skew-x-12 translate-x-16"></div>
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Aggregated Cash Position</span>
                    <span
                        className={`px-2 py-1 bg-green-100 text-green-700 rounded text-[10px] font-black transition-all duration-700 ${
                            isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                        }`}
                    >
                        +12.4% MoM
                    </span>
                </div>
                <p className="text-5xl font-black text-[#FFB300] tracking-tighter mb-4 tabular-nums">
                    ${formatCurrency(mainCount)}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div
                        className={`bg-white p-3 rounded-lg border border-slate-100 transition-all duration-500 ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                        }`}
                        style={{ transitionDelay: '200ms' }}
                    >
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Operating Liquidity</p>
                        <p className="text-lg font-bold text-slate-700 tabular-nums">${formatCurrency(opCount)}</p>
                    </div>
                    <div
                        className={`bg-white p-3 rounded-lg border border-slate-100 transition-all duration-500 ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                        }`}
                        style={{ transitionDelay: '300ms' }}
                    >
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Tax Reserves</p>
                        <p className="text-lg font-bold text-slate-700 tabular-nums">${formatCurrency(taxCount)}</p>
                    </div>
                    <div
                        className={`bg-white p-3 rounded-lg border border-slate-100 transition-all duration-500 ${
                            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                        }`}
                        style={{ transitionDelay: '400ms' }}
                    >
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Projected Available Cash</p>
                        <p className="text-lg font-bold text-[#1B5E20] tabular-nums">${formatCurrency(projCount)}</p>
                    </div>
                </div>
            </div>
            {/* Animated Mini Bar Chart */}
            <div className="flex items-end gap-1.5 h-16 mt-6">
                {barHeights.map((height, index) => {
                    const isGreen = index >= 4;
                    const greenOpacity = index === 4 ? '40' : index === 5 ? '60' : '';
                    const bgClass = isGreen
                        ? greenOpacity ? `bg-[#1B5E20]/${greenOpacity}` : 'bg-[#1B5E20]'
                        : 'bg-slate-200';

                    return (
                        <div
                            key={index}
                            className={`flex-1 ${bgClass} rounded-t-sm transition-all duration-700 ease-out`}
                            style={{
                                height: isVisible ? `${height}%` : '0%',
                                transitionDelay: `${500 + index * 100}ms`
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
