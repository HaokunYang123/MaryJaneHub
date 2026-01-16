"use client";

import { useState, useEffect, useRef } from 'react';
import { AnimatedNumber } from '@/components/ui/animated-number';

export function QuickBooksStatusCard() {
    const [isVisible, setIsVisible] = useState(false);
    const [isConnected, setIsConnected] = useState<boolean | null>(null);
    const [isLoading, setIsLoading] = useState(true);
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

    useEffect(() => {
        async function checkStatus() {
            try {
                const res = await fetch('/api/auth/quickbooks?action=status');
                const data = await res.json();
                setIsConnected(data.authenticated);
            } catch {
                setIsConnected(false);
            } finally {
                setIsLoading(false);
            }
        }
        checkStatus();
    }, []);

    const handleConnect = () => {
        window.location.href = '/api/auth/quickbooks';
    };

    return (
        <div ref={cardRef} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-slate-800">QuickBooks Integration</h3>
                <span className={`material-symbols-outlined transition-all duration-500 ${isVisible ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90'}`}>
                    account_balance
                </span>
            </div>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1B5E20]"></div>
                </div>
            ) : isConnected ? (
                <>
                    <div className={`flex items-center gap-3 mb-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`} style={{ transitionDelay: '100ms' }}>
                        <div className="size-10 rounded-full bg-green-100 flex items-center justify-center">
                            <span className="material-symbols-outlined text-green-600">check_circle</span>
                        </div>
                        <div>
                            <p className="font-bold text-green-700">Connected</p>
                            <p className="text-xs text-slate-500">Auto-sync enabled</p>
                        </div>
                    </div>

                    <div className={`grid grid-cols-2 gap-3 mt-auto transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
                        <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Bills Synced</p>
                            <p className="text-lg font-black text-slate-800 tabular-nums">
                                {isVisible ? <AnimatedNumber value={24} duration={1200} delay={300} /> : '0'}
                            </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">This Month</p>
                            <p className="text-lg font-black text-[#1B5E20] tabular-nums">
                                {isVisible ? <AnimatedNumber value={8} duration={1200} delay={400} /> : '0'}
                            </p>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className={`flex items-center gap-3 mb-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`} style={{ transitionDelay: '100ms' }}>
                        <div className="size-10 rounded-full bg-orange-100 flex items-center justify-center">
                            <span className="material-symbols-outlined text-orange-600">link_off</span>
                        </div>
                        <div>
                            <p className="font-bold text-orange-700">Not Connected</p>
                            <p className="text-xs text-slate-500">Connect to sync invoices</p>
                        </div>
                    </div>

                    <p className={`text-sm text-slate-500 mb-4 transition-all duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '200ms' }}>
                        Connect QuickBooks to automatically create bills from uploaded invoices.
                    </p>

                    <button
                        onClick={handleConnect}
                        className={`mt-auto w-full py-3 bg-[#2CA01C] text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-[#2CA01C]/90 transition-all ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                        style={{ transitionDelay: '300ms' }}
                    >
                        <span className="material-symbols-outlined text-sm">link</span>
                        Connect QuickBooks
                    </button>
                </>
            )}
        </div>
    );
}
