"use client";

import { useState, useEffect, useRef } from 'react';
import { AnimatedNumber, AnimatedCurrency } from '@/components/ui/animated-number';

const totalLiability = 68420;
const employeeCount = 17;

export function PayrollCard() {
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
        <div ref={cardRef} className="bg-[#1B5E20] text-white rounded-xl shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">Payroll Cycle</h3>
                <span className={`material-symbols-outlined transition-all duration-500 ${isVisible ? 'opacity-100 rotate-0' : 'opacity-0 -rotate-90'}`}>schedule</span>
            </div>
            <div className={`mb-4 transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
                <p className="text-[10px] uppercase font-bold text-white/60">Next Run Date</p>
                <p className="text-3xl font-black">March 15, 2024</p>
            </div>
            <div className="space-y-4">
                <div className={`flex items-center justify-between py-2 border-b border-white/10 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`} style={{ transitionDelay: '200ms' }}>
                    <div className="flex -space-x-2">
                        <div
                            className={`size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 bg-cover bg-center transition-all duration-300 ${isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
                            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuACW0QYstZLkOKsyStIOAECSDWfMiyZ438Gueyg4VdBKyc4RI7oppLyhNkODikne_bpD3As29nYPEWAtcEOq92lliKl6bYswZtjROYv7wMF6KcjinWFMrkVaKqF14nOokXen0pGv2rjKf6Lu5Bt_iCgNeCZrRWbK60MWqhmd8ejmIq_I4tizb96vUMBm-4g3JRlV6pUPPJf_ns9-9g3fHdlrzg9Ql0cmPVVp_B9iG6pQaAZNef80Zj5p4X1_lGH7ftG1axeaJ3_6A")', transitionDelay: '300ms' }}
                        ></div>
                        <div
                            className={`size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 bg-cover bg-center transition-all duration-300 ${isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
                            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAklvVHyG7bc0OLCmy22H_iaN20mJ74VEH98dpwzJ6FViJX9bzVbaqgwZfYFRVhpv3b7XLJBuIo32y33aFQuC4Ow-2bbHE8oOBlX553uIm8BBHBbqFKmp7u-Khab4kx9jOW4IUtiNTey09sQ6iKvxA9YVX_m8bciip7EkQvBkelEexcw4_-OOtR7DbH9Kvcn3vRDFw-1aSfBVLyDiqQ09LqPZoWvB_VS1woeM7bpbOaFn07HLnU2G8iVdFa8S5HkyaFrIh8sfHlfg")', transitionDelay: '400ms' }}
                        ></div>
                        <div
                            className={`size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 bg-cover bg-center transition-all duration-300 ${isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
                            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBljt6PFAPxluIib9ERkBLu-wuJu_Dg4rGYufEBBreszV3s50G8rWdPAawZXOKhBjwXTJyXkeQQqhvQi5XE4fZ-vhxlm3J3oT9uHAk7P_iokN-3O46freN3MKGzkU3b1_RluOMgiu4B2N6Nx136PyG692GG_ARPQFxRXb2hMTscyHEvrZDgZY8Y3kswGuv1SD75EMidWsCC4E6jxNW6bwqZCpcWL5gXvkNoIlnqncwWWPiRWsOZbMDwVzmnLOGveu52vFhf2SS93Q")', transitionDelay: '500ms' }}
                        ></div>
                        <div
                            className={`size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 flex items-center justify-center text-[8px] font-bold text-[#1B5E20] transition-all duration-300 ${isVisible ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`}
                            style={{ transitionDelay: '600ms' }}
                        >+14</div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tabular-nums">
                        {isVisible ? <AnimatedNumber value={employeeCount} duration={1000} delay={300} /> : '0'} Employees
                    </span>
                </div>
                <div className={`bg-white/10 p-3 rounded-lg flex items-center justify-between transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '400ms' }}>
                    <div>
                        <p className="text-[10px] font-bold uppercase text-white/60">Total Liability</p>
                        <p className="text-xl font-black tabular-nums">
                            {isVisible ? <AnimatedCurrency value={totalLiability} duration={1400} delay={500} className="text-white" /> : '$0.00'}
                        </p>
                    </div>
                    <span className="material-symbols-outlined text-white/30 text-3xl">account_balance_wallet</span>
                </div>
            </div>
            <button className={`mt-6 w-full py-3 bg-[#FFB300] text-slate-900 font-black rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-[#FFB300]/20 hover:scale-[1.02] active:scale-95 transition-all ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '600ms' }}>
                Review & Approve
            </button>
        </div>
    );
}
