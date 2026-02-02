import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/auth/admin-access";
import AssistantAuditViewer from "./AssistantAuditViewer";

export const dynamic = "force-dynamic";

export default async function AssistantAuditPage() {
  const access = await requireAdminAccess();
  if (!access.ok) {
    redirect(access.status === 401 ? "/login" : "/unauthorized");
  }
  const user = access.user;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Assistant Audit</h2>
          <p className="mt-1 text-gray-600">
            Fetch a single assistant audit record by request ID.
          </p>
        </div>

        <AssistantAuditViewer />
      </main>
    </div>
  );
}
