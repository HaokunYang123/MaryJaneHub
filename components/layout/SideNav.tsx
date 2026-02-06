"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface SideNavProps {
  isAdmin: boolean;
}

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const coreItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/documents", label: "Documents", icon: "folder_open" },
];

const adminItems: NavItem[] = [
  { href: "/admin/audit/assistant", label: "Assistant Audit", icon: "history" },
  { href: "/admin/whitelist", label: "Whitelist", icon: "admin_panel_settings" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemClasses(active: boolean): string {
  if (active) {
    return "bg-[var(--brand-green)] text-white";
  }
  return "text-slate-700 hover:bg-slate-100";
}

export default function SideNav({ isAdmin }: SideNavProps) {
  const pathname = usePathname();

  const items = isAdmin ? [...coreItems, ...adminItems] : coreItems;

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-5 lg:block">
      <nav className="space-y-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${itemClasses(active)}`}
            >
              <span className="material-symbols-outlined text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
