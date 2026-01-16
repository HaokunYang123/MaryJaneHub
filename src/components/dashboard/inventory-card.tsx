"use client";

import { useState, useEffect, useRef } from 'react';
import { AnimatedNumber, AnimatedCurrency, AnimatedPercent } from '@/components/ui/animated-number';

const flowerBulk = 4280;
const retailUnits = 842;
const retailValue = 124500;
const capacityPercent = 72;

export function InventoryCard() {
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
        <div ref={cardRef} className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1B5E20]">eco</span> Inventory Status
                </h3>
                <span className={`px-2 py-0.5 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
                    Arizona Sales
                </span>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className={`text-center p-3 bg-white rounded-lg shadow-sm border border-slate-100 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
                    <p className="text-2xl font-black text-slate-800 tabular-nums">
                        {isVisible ? <AnimatedNumber value={flowerBulk} duration={1200} /> : '0'}
                        <span className="text-xs text-slate-400 ml-1">g</span>
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Flower Bulk</p>
                </div>
                <div className={`text-center p-3 bg-white rounded-lg shadow-sm border border-slate-100 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
                    <p className="text-2xl font-black text-slate-800 tabular-nums">
                        {isVisible ? <AnimatedNumber value={retailUnits} duration={1200} delay={100} /> : '0'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Retail Units</p>
                </div>
            </div>
            <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Retail Value</span>
                    <span className="font-bold">
                        {isVisible ? <AnimatedCurrency value={retailValue} duration={1400} delay={200} /> : '$0.00'}
                    </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-[#FFB300] transition-all duration-1000 ease-out"
                        style={{ width: isVisible ? `${capacityPercent}%` : '0%', transitionDelay: '400ms' }}
                    />
                </div>
                <p className="text-[10px] text-slate-400 text-right">
                    Capacity: {isVisible ? <AnimatedPercent value={capacityPercent} duration={1000} delay={400} decimals={0} /> : '0%'} used
                </p>
            </div>
            <button className="mt-auto w-full py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-black transition-colors">
                Manage METRC Sync
            </button>
        </div>
    );
}
