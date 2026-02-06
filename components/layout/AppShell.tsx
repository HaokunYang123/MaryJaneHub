import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/session";
import HeaderBar from "./HeaderBar";
import SideNav from "./SideNav";
import FooterBar from "./FooterBar";

interface AppShellProps {
  user: AuthUser;
  children: ReactNode;
}

export default function AppShell({ user, children }: AppShellProps) {
  const isAdmin = user.role === "admin";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <HeaderBar user={user} />
      <div className="mx-auto flex w-full max-w-7xl">
        <SideNav isAdmin={isAdmin} />
        <main className="min-h-[calc(100vh-98px)] flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
      <FooterBar />
    </div>
  );
}
