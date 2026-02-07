import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import DocumentsWorkspace from "@/components/documents/DocumentsWorkspace";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const { user } = await getSession();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell user={user}>
      <DocumentsWorkspace />
    </AppShell>
  );
}
