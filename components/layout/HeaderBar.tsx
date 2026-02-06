import Link from "next/link";
import type { AuthUser } from "@/lib/auth/session";

interface HeaderBarProps {
  user: AuthUser;
}

export default function HeaderBar({ user }: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-green)] text-xl font-black text-white">
              M
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-[var(--brand-green)]">
                MaryJane Hub
              </p>
              <p className="text-[11px] text-slate-500">Document Operations</p>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/api/quickbooks/connect"
            className="hidden rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:block"
          >
            Connect QuickBooks
          </Link>

          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold text-slate-900">{user.name || user.email}</p>
            <p className="text-[11px] text-slate-500">{user.role || "user"}</p>
          </div>

          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name || user.email}
              className="h-9 w-9 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
              {(user.name || user.email || "U").slice(0, 1).toUpperCase()}
            </div>
          )}

          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
