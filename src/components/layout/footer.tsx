export function Footer() {
    return (
        <footer className="bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-between text-[10px] font-medium text-slate-500">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className="size-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    <span>System Live: 99.9% Uptime</span>
                </div>
                <div className="h-3 w-[1px] bg-slate-200"></div>
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[12px]">sync</span>
                    <span>Last Entity Sync: 2m ago</span>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <a className="hover:text-[#1B5E20]" href="#">Compliance Docs</a>
                <a className="hover:text-[#1B5E20]" href="#">Support Center</a>
                <span className="text-slate-300 font-light">v4.12.0-STABLE</span>
            </div>
        </footer>
    );
}
