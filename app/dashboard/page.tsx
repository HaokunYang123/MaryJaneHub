import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { user, error } = await getSession();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">MaryJane Hub</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {user.avatarUrl && (
                  <img
                    src={user.avatarUrl}
                    alt={user.name || user.email}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div className="text-sm">
                  <p className="font-medium text-gray-900">{user.name || user.email}</p>
                  <p className="text-gray-500 text-xs">{user.role}</p>
                </div>
              </div>
              <form action="/api/auth/signout" method="POST">
                <button
                  type="submit"
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="mt-1 text-gray-600">Welcome back, {user.name || user.email}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link href="/documents" className="block">
            <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
              <p className="mt-2 text-gray-600">View and manage processed documents</p>
            </div>
          </Link>

          <Link href="/api/documents/sync" className="block">
            <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-lg font-semibold text-gray-900">Sync Inbox</h3>
              <p className="mt-2 text-gray-600">Process new documents from Drive inbox</p>
            </div>
          </Link>

          <Link href="/api/documents/search" className="block">
            <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-lg font-semibold text-gray-900">Search</h3>
              <p className="mt-2 text-gray-600">Search documents using AI-powered semantic search</p>
            </div>
          </Link>

          {user.role === "admin" && (
            <Link href="/admin/whitelist" className="block">
              <div className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow border-2 border-blue-100">
                <h3 className="text-lg font-semibold text-gray-900">User Management</h3>
                <p className="mt-2 text-gray-600">Manage authorized users (Admin only)</p>
              </div>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
