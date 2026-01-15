export function Header() {
    return (
        <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                    <div className="size-9 bg-[#1B5E20] flex items-center justify-center rounded-lg shadow-lg">
                        <span className="material-symbols-outlined text-white text-xl">potted_plant</span>
                    </div>
                    <h1 className="text-xl font-black tracking-tight text-[#1B5E20] uppercase">
                        Mary&apos;s <span className="text-slate-400 font-light">Hub</span>
                    </h1>
                </div>
                <div className="hidden md:flex items-center">
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                        <span className="text-sm font-semibold">All Entities</span>
                        <span className="material-symbols-outlined text-sm">expand_more</span>
                    </button>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <span className="material-symbols-outlined p-2 text-slate-500 hover:bg-slate-100 rounded-full cursor-pointer">notifications</span>
                    <span className="absolute top-2 right-2 size-2 bg-[#D32F2F] rounded-full border-2 border-white"></span>
                </div>
                <span className="material-symbols-outlined p-2 text-slate-500 hover:bg-slate-100 rounded-full cursor-pointer">settings</span>
                <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs font-bold leading-none">Alex Rivera</p>
                        <p className="text-[10px] text-slate-500">Global Admin</p>
                    </div>
                    <div
                        className="size-10 rounded-full bg-cover bg-center border-2 border-slate-100 bg-slate-300"
                        style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuD2RPe4qGeyyt_C_1y2QRImrpZxI4Q7knD-huaAmZL3DhgMmUOb1wgr8Ca4F_ba3107nRYYr3U4oEPtawKFwqjTpgd340oxvM_TaNvQsiTVFFqX372sVzW6DgCUQVA_VURtJ6LZI4XZfdVYfCZ6HYo1ztGFiWW5Z_YJxnr2HRnsSjYYwCdaX_-S9BTbWMCzw6nAoQFfvmx8r3lNpM-Z_OYBTEJ8bszHUhzRRjEAD0PMFGVutUABID9-xd91UPSt3TiGWd6c6oufGw")' }}
                    ></div>
                </div>
            </div>
        </header>
    );
}
