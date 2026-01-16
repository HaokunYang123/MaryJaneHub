"use client";

import { useState, useEffect, useRef } from 'react';
import { AnimatedCurrency } from '@/components/ui/animated-number';

const receivables = [
    { entity: 'Green Relief LLC', amount: 12450, overdue: 14, severity: 'high' },
    { entity: 'Bud & Bloom', amount: 8200, overdue: 5, severity: 'medium' },
    { entity: 'High Desert AZ', amount: 4120, overdue: 1, severity: 'low' },
];

export function AccountsReceivableCard() {
    const [isVisible, setIsVisible] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setIsVisible(true);
            },
            { threshold: 0.1 }
        );
        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, []);

    const getSeverityStyle = (severity: string) => {
        switch (severity) {
            case 'high': return 'bg-red-100 text-red-600';
            case 'medium': return 'bg-orange-100 text-orange-600';
            default: return 'bg-slate-100 text-slate-400';
        }
    };

    return (
        <div ref={cardRef} className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white/50">
                <h3 className="font-bold text-sm">Accounts Receivable</h3>
                <button className="text-[10px] font-bold text-[#1B5E20] flex items-center">
                    VIEW ALL <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                </button>
            </div>
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="text-slate-400 bg-slate-50/50">
                            <th className="px-4 py-2 font-semibold">ENTITY</th>
                            <th className="px-4 py-2 font-semibold text-right">AMOUNT</th>
                            <th className="px-4 py-2 font-semibold text-center">OVERDUE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {receivables.map((item, index) => (
                            <tr
                                key={item.entity}
                                className={`transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                                style={{ transitionDelay: `${index * 100}ms` }}
                            >
                                <td className="px-4 py-3 font-medium">{item.entity}</td>
                                <td className="px-4 py-3 text-right font-bold">
                                    {isVisible ? (
                                        <AnimatedCurrency value={item.amount} duration={1200} delay={index * 100} />
                                    ) : '$0.00'}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`px-2 py-0.5 ${getSeverityStyle(item.severity)} rounded-full font-bold`}>
                                        {item.overdue}d
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-3 bg-slate-50/80 mt-auto">
                <button className="w-full py-2 bg-white border border-[#1B5E20]/20 text-[#1B5E20] text-[11px] font-black rounded-lg uppercase tracking-wider hover:bg-[#1B5E20] hover:text-white transition-all">
                    Send 12 Reminders
                </button>
            </div>
        </div>
    );
}
