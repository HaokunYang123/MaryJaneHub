"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function Header() {
    const router = useRouter();

    const handleLogout = async () => {
        // Clear AI conversation history on server
        try {
            await fetch('/api/assistant', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: 'default' })
            });
        } catch (error) {
            console.error('Error clearing chat history:', error);
        }

        // Clear session storage (AI chat messages)
        sessionStorage.removeItem('ai-chat-messages');

        // Clear local login state
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('userEmail');

        // Redirect to login
        router.push('/login');
    };

    return (
        <header className="sticky top-0 z-50 w-full bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-8">
                <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="size-9 bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center rounded-xl shadow-lg">
                        <span className="text-white text-xl font-black">M</span>
                    </div>
                    <h1 className="text-xl font-black tracking-tight text-[#1B5E20] uppercase">
                        Mary&apos;s <span className="text-slate-400 font-light">Hub</span>
                    </h1>
                </Link>
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
                <Link href="/settings" className="material-symbols-outlined p-2 text-slate-500 hover:bg-slate-100 rounded-full cursor-pointer">settings</Link>
                <div className="h-8 w-[1px] bg-slate-200 mx-2"></div>
                <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                        <p className="text-xs font-bold leading-none">Mary</p>
                        <p className="text-[10px] text-slate-500">Global Admin</p>
                    </div>
                    <div
                        className="size-10 rounded-full bg-cover bg-center border-2 border-slate-100 bg-slate-300"
                        style={{ backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuD2RPe4qGeyyt_C_1y2QRImrpZxI4Q7knD-huaAmZL3DhgMmUOb1wgr8Ca4F_ba3107nRYYr3U4oEPtawKFwqjTpgd340oxvM_TaNvQsiTVFFqX372sVzW6DgCUQVA_VURtJ6LZI4XZfdVYfCZ6HYo1ztGFiWW5Z_YJxnr2HRnsSjYYwCdaX_-S9BTbWMCzw6nAoQFfvmx8r3lNpM-Z_OYBTEJ8bszHUhzRRjEAD0PMFGVutUABID9-xd91UPSt3TiGWd6c6oufGw")' }}
                    ></div>
                    <button
                        onClick={handleLogout}
                        className="p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 rounded-full cursor-pointer transition-colors"
                        title="Logout"
                    >
                        <span className="material-symbols-outlined text-xl">logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
