import type { ReactNode } from "react";
import type { AuthUser } from "@/lib/auth/session";
import HeaderBar from "./HeaderBar";
import SideNav from "./SideNav";
import AiRail from "./AiRail";
import { AiRailProvider } from "./AiRailProvider";

interface AppShellProps {
  user: AuthUser;
  children: ReactNode;
}

export default function AppShell({ user, children }: AppShellProps) {
  const isAdmin = user.role === "admin";

  return (
    <div className="flex h-screen min-h-screen flex-col overflow-hidden bg-slate-50 text-slate-900 supports-[height:100dvh]:h-dvh">
      <HeaderBar user={user} />
      <AiRailProvider>
        <div className="mx-auto flex min-h-0 w-full max-w-[1660px] flex-1 overflow-hidden">
          <SideNav isAdmin={isAdmin} />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">{children}</main>
          <AiRail />
        </div>
      </AiRailProvider>
    </div>
  );
}
