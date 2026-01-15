export function PayrollCard() {
    return (
        <div className="bg-[#1B5E20] text-white rounded-xl shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm">Payroll Cycle</h3>
                <span className="material-symbols-outlined">schedule</span>
            </div>
            <div className="mb-4">
                <p className="text-[10px] uppercase font-bold text-white/60">Next Run Date</p>
                <p className="text-3xl font-black">March 15, 2024</p>
            </div>
            <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-white/10">
                    <div className="flex -space-x-2">
                        <div
                            className="size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 bg-cover bg-center"
                            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuACW0QYstZLkOKsyStIOAECSDWfMiyZ438Gueyg4VdBKyc4RI7oppLyhNkODikne_bpD3As29nYPEWAtcEOq92lliKl6bYswZtjROYv7wMF6KcjinWFMrkVaKqF14nOokXen0pGv2rjKf6Lu5Bt_iCgNeCZrRWbK60MWqhmd8ejmIq_I4tizb96vUMBm-4g3JRlV6pUPPJf_ns9-9g3fHdlrzg9Ql0cmPVVp_B9iG6pQaAZNef80Zj5p4X1_lGH7ftG1axeaJ3_6A")' }}
                        ></div>
                        <div
                            className="size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 bg-cover bg-center"
                            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuAklvVHyG7bc0OLCmy22H_iaN20mJ74VEH98dpwzJ6FViJX9bzVbaqgwZfYFRVhpv3b7XLJBuIo32y33aFQuC4Ow-2bbHE8oOBlX553uIm8BBHBbqFKmp7u-Khab4kx9jOW4IUtiNTey09sQ6iKvxA9YVX_m8bciip7EkQvBkelEexcw4_-OOtR7DbH9Kvcn3vRDFw-1aSfBVLyDiqQ09LqPZoWvB_VS1woeM7bpbOaFn07HLnU2G8iVdFa8S5HkyaFrIh8sfHlfg")' }}
                        ></div>
                        <div
                            className="size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 bg-cover bg-center"
                            style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuBljt6PFAPxluIib9ERkBLu-wuJu_Dg4rGYufEBBreszV3s50G8rWdPAawZXOKhBjwXTJyXkeQQqhvQi5XE4fZ-vhxlm3J3oT9uHAk7P_iokN-3O46freN3MKGzkU3b1_RluOMgiu4B2N6Nx136PyG692GG_ARPQFxRXb2hMTscyHEvrZDgZY8Y3kswGuv1SD75EMidWsCC4E6jxNW6bwqZCpcWL5gXvkNoIlnqncwWWPiRWsOZbMDwVzmnLOGveu52vFhf2SS93Q")' }}
                        ></div>
                        <div className="size-6 rounded-full border-2 border-[#1B5E20] bg-slate-300 flex items-center justify-center text-[8px] font-bold text-[#1B5E20]">+14</div>
                    </div>
                    <span className="text-[10px] font-bold uppercase">17 Employees</span>
                </div>
                <div className="bg-white/10 p-3 rounded-lg flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase text-white/60">Total Liability</p>
                        <p className="text-xl font-black">$68,420</p>
                    </div>
                    <span className="material-symbols-outlined text-white/30 text-3xl">account_balance_wallet</span>
                </div>
            </div>
            <button className="mt-6 w-full py-3 bg-[#FFB300] text-slate-900 font-black rounded-lg text-xs uppercase tracking-widest shadow-lg shadow-[#FFB300]/20 hover:scale-[1.02] active:scale-95 transition-all">
                Review & Approve
            </button>
        </div>
    );
}
