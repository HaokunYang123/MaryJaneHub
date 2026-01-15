"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
    { href: "/", icon: "dashboard", label: "Dashboard", active: true },
    { href: "/ai", icon: "smart_toy", label: "AI Assistant", highlight: true },
    { href: "/files", icon: "folder_open", label: "Files & Docs", highlight: true },
    { href: "/bank-accounts", icon: "account_balance", label: "Bank Accounts", badge: "20" },
    { href: "/reports", icon: "description", label: "P&L Reports" },
];

const operationsItems = [
    { href: "/payable", icon: "payments", label: "Accounts Payable" },
    { href: "/receivable", icon: "request_quote", label: "Accounts Receivable" },
    { href: "/payroll", icon: "badge", label: "Payroll" },
    { href: "/inventory", icon: "inventory_2", label: "Cannabis Inventory" },
];

const complianceItems = [
    { href: "/arizona-sales", icon: "location_on", label: "Arizona Sales" },
    { href: "/tenant-payments", icon: "real_estate_agent", label: "Tenant Payments" },
    { href: "/reconciliation", icon: "check_circle", label: "Reconciliation" },
    { href: "/alerts", icon: "warning", label: "Alerts", alert: true },
];

export function Sidebar() {
    const pathname = usePathname();

    const NavItem = ({ href, icon, label, badge, alert, highlight }: { href: string; icon: string; label: string; badge?: string; alert?: boolean; highlight?: boolean }) => {
        const isActive = pathname === href;
        return (
            <Link
                href={href}
                className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all",
                    isActive
                        ? "bg-[#1B5E20] text-white"
                        : highlight
                        ? "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                        : "text-slate-600 hover:bg-slate-50"
                )}
            >
                <span className={cn("material-symbols-outlined", highlight && !isActive && "text-amber-600")}>{icon}</span>
                <span className="text-sm font-medium">{label}</span>
                {badge && (
                    <span className="ml-auto text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold">{badge}</span>
                )}
                {alert && (
                    <span className="ml-auto size-2 bg-[#D32F2F] rounded-full"></span>
                )}
                {highlight && !isActive && (
                    <span className="ml-auto text-[10px] bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold">NEW</span>
                )}
            </Link>
        );
    };

    return (
        <aside className="w-64 border-r border-slate-200 bg-white hidden lg:flex flex-col p-4 overflow-y-auto">
            <nav className="space-y-1">
                {navItems.map((item) => (
                    <NavItem key={item.href} {...item} />
                ))}

                <div className="py-2 px-4 uppercase text-[10px] font-bold text-slate-400 tracking-widest mt-4">Operations</div>

                {operationsItems.map((item) => (
                    <NavItem key={item.href} {...item} />
                ))}

                <div className="py-2 px-4 uppercase text-[10px] font-bold text-slate-400 tracking-widest mt-4">Compliance</div>

                {complianceItems.map((item) => (
                    <NavItem key={item.href} {...item} />
                ))}
            </nav>

            <div className="mt-auto p-4 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Entity Support</p>
                <button className="w-full bg-white text-xs font-semibold py-2 rounded shadow-sm hover:shadow transition-shadow">
                    Contact Advisor
                </button>
            </div>
        </aside>
    );
}
