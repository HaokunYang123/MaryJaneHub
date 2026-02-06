import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSyncStatusSummary } from "@/lib/supabase/documents";
import AppShell from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user } = await getSession();

  if (!user) {
    redirect("/login");
  }

  let summary = {
    pending_review: 0,
    needs_attention: 0,
    approved: 0,
    auto_approved: 0,
    synced: 0,
    error: 0,
    rejected: 0,
    not_applicable: 0,
  };

  try {
    const data = await getSyncStatusSummary();
    summary = { ...summary, ...data };
  } catch (error) {
    console.warn("Failed to load dashboard summary", error);
  }

  const reviewCount = summary.pending_review + summary.needs_attention;
  const readyToSync = summary.approved + summary.auto_approved;
  const syncedCount = summary.synced;
  const errorCount = summary.error;

  return (
    <AppShell user={user}>
      <section className="mb-6 flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Financial Command Center</h1>
        <p className="text-sm text-slate-600">
          Reused shell/dashboard UI merged from legacy design, wired to current backend status.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Needs Review</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{reviewCount}</p>
          <p className="mt-1 text-xs text-slate-500">pending_review + needs_attention</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ready To Sync</p>
          <p className="mt-2 text-3xl font-black text-[var(--brand-green)]">{readyToSync}</p>
          <p className="mt-1 text-xs text-slate-500">approved + auto_approved</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Synced</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{syncedCount}</p>
          <p className="mt-1 text-xs text-slate-500">successfully pushed to QuickBooks</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Errors</p>
          <p className="mt-2 text-3xl font-black text-red-700">{errorCount}</p>
          <p className="mt-1 text-xs text-slate-500">documents with sync errors</p>
        </article>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Quick Actions</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/documents"
              className="rounded-lg bg-[var(--brand-green)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              Open Documents
            </Link>
            <Link
              href="/api/quickbooks/connect"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Connect QuickBooks
            </Link>
            <Link
              href="/api/documents/summary"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              View Summary API
            </Link>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Admin</h2>
          {user.role === "admin" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin/audit/assistant"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Assistant Audit
              </Link>
              <Link
                href="/admin/whitelist"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Whitelist
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Admin links are available to admin users only.</p>
          )}
        </article>
      </section>
    </AppShell>
  );
}
