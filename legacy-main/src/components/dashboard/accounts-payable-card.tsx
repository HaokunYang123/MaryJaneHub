"use client";

import { useState, useEffect, useRef } from 'react';
import { AnimatedCurrency } from '@/components/ui/animated-number';

const payables = [
    { vendor: 'Apex Security', invoice: 'Inv #4492', amount: 3400, urgent: true },
    { vendor: 'City of Phoenix', invoice: 'Utilities', amount: 890, urgent: false },
    { vendor: 'Nutrient Pro', invoice: 'Inv #221', amount: 2150, urgent: false },
];

const weeklyTotal = 14230;

export function AccountsPayableCard() {
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

    return (
        <div ref={cardRef} className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white/50">
                <h3 className="font-bold text-sm">Accounts Payable</h3>
                <span className={`text-[10px] bg-slate-200 px-1.5 py-0.5 rounded font-bold transition-all duration-500 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
                    8 PENDING
                </span>
            </div>
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs">
                    <thead>
                        <tr className="text-slate-400 bg-slate-50/50">
                            <th className="px-4 py-2 font-semibold">VENDOR</th>
                            <th className="px-4 py-2 font-semibold text-right">DUE</th>
                            <th className="px-4 py-2 font-semibold text-right">ACTION</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {payables.map((item, index) => (
                            <tr
                                key={item.vendor}
                                className={`transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                                style={{ transitionDelay: `${index * 100}ms` }}
                            >
                                <td className="px-4 py-3">
                                    <p className="font-medium">{item.vendor}</p>
                                    <p className="text-[10px] text-slate-400">{item.invoice}</p>
                                </td>
                                <td className={`px-4 py-3 text-right font-bold ${item.urgent ? 'text-[#D32F2F]' : ''}`}>
                                    -{isVisible ? (
                                        <AnimatedCurrency value={item.amount} duration={1200} delay={index * 100} />
                                    ) : '$0.00'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button className="px-3 py-1 bg-[#1B5E20] text-white rounded font-bold text-[10px]">PAY</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-3 bg-slate-50/80 mt-auto">
                <p className="text-[10px] text-slate-400 text-center mb-1">
                    Weekly total: {isVisible ? (
                        <AnimatedCurrency value={weeklyTotal} duration={1500} delay={300} className="font-bold" />
                    ) : '$0.00'}
                </p>
            </div>
        </div>
    );
}
