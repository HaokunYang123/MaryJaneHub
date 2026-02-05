import Link from "next/link";

export default function WhitelistPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Whitelist Admin</h1>
      <p className="mt-2 text-gray-600">
        This page is intentionally minimal. Manage whitelist entries via the
        admin API endpoints.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Link className="text-blue-600 underline" href="/api/admin/whitelist">
          View whitelist API
        </Link>
        <Link className="text-blue-600 underline" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
