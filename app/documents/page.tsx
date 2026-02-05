import Link from "next/link";

export default function DocumentsPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Documents</h1>
      <p className="mt-2 text-gray-600">
        This is a minimal landing page to avoid dead links. Use the API routes
        or admin tools to review and approve documents.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <Link className="text-blue-600 underline" href="/api/documents">
          View documents API
        </Link>
        <Link className="text-blue-600 underline" href="/api/export">
          Export data
        </Link>
        <Link className="text-blue-600 underline" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
