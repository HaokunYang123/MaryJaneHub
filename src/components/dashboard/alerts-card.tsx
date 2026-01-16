"use client";

import { useState, useEffect, useRef } from 'react';
import { AnimatedCurrency } from '@/components/ui/animated-number';

export function AlertsCard() {
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

    const alertItems = [
        {
            type: 'error',
            icon: 'error',
            bgColor: 'bg-red-50',
            borderColor: 'border-[#D32F2F]',
            iconColor: 'text-[#D32F2F]',
            title: 'Reconciliation Error',
            titleColor: 'text-red-900',
            description: 'Chase Entity-B mismatch: -',
            descColor: 'text-red-700/70',
            amount: 4200,
        },
        {
            type: 'warning',
            icon: 'warning',
            bgColor: 'bg-orange-50',
            borderColor: 'border-[#F57C00]',
            iconColor: 'text-[#F57C00]',
            title: 'Low Balance Warning',
            titleColor: 'text-orange-900',
            description: 'Payroll Account #402 below threshold',
            descColor: 'text-orange-700/70',
        },
    ];

    const infoItems = [
        { icon: 'schedule', text: 'Inventory sync delayed (AZ Disp-1)', hasBorder: true },
        { icon: 'schedule', text: 'Pending lease payment for Mar-01', hasBorder: true },
        { icon: 'task_alt', text: 'All entity filings current', hasBorder: false, muted: true },
    ];

    return (
        <div ref={cardRef} className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#D32F2F]">report</span> Critical Alerts
                </h3>
                <span className={`text-[10px] text-slate-400 transition-all duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}>
                    LAST 24H
                </span>
            </div>
            <div className="space-y-3 flex-1">
                {alertItems.map((alert, index) => (
                    <div
                        key={alert.title}
                        className={`flex items-start gap-3 p-2 ${alert.bgColor} rounded-lg border-l-4 ${alert.borderColor} transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                        style={{ transitionDelay: `${index * 100}ms` }}
                    >
                        <span className={`material-symbols-outlined ${alert.iconColor} text-sm mt-0.5`}>{alert.icon}</span>
                        <div>
                            <p className={`text-xs font-bold ${alert.titleColor}`}>{alert.title}</p>
                            <p className={`text-[10px] ${alert.descColor}`}>
                                {alert.description}
                                {alert.amount && (
                                    <span className="tabular-nums">
                                        {isVisible ? <AnimatedCurrency value={alert.amount} duration={1200} delay={index * 100 + 200} /> : '$0.00'}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                ))}
                {infoItems.map((item, index) => (
                    <div
                        key={item.text}
                        className={`flex items-center gap-3 p-2 ${item.hasBorder ? 'border-b border-slate-100' : ''} transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                        style={{ transitionDelay: `${(index + 2) * 100}ms` }}
                    >
                        <span className="material-symbols-outlined text-slate-400 text-sm">{item.icon}</span>
                        <p className={`text-xs ${item.muted ? 'text-slate-400' : 'text-slate-600'}`}>{item.text}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
