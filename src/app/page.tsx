import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { AiSidebar } from "@/components/layout/ai-sidebar";
import { FloatingAiButton } from "@/components/layout/floating-ai-button";
import { CashPositionCard } from "@/components/dashboard/cash-position-card";
import { AlertsCard } from "@/components/dashboard/alerts-card";
import { AccountsReceivableCard } from "@/components/dashboard/accounts-receivable-card";
import { AccountsPayableCard } from "@/components/dashboard/accounts-payable-card";
import { InventoryCard } from "@/components/dashboard/inventory-card";

export default function Home() {
  return (
    <div className="bg-white text-slate-900 h-screen flex flex-col overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 scroll-smooth">
          {/* Page Heading */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Financial Command Center</h2>
              <p className="text-slate-500 text-sm mt-1">Real-time oversight for multi-state operations</p>
            </div>
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors">
                <span className="material-symbols-outlined text-sm">download</span> Export PDF
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg shadow-[#1B5E20]/20 hover:bg-[#1B5E20]/90 transition-colors">
                <span className="material-symbols-outlined text-sm">add</span> New Transaction
              </button>
            </div>
          </div>

          {/* Bento Box Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            <CashPositionCard />
            <AlertsCard />
            <AccountsReceivableCard />
            <AccountsPayableCard />
            <InventoryCard />
          </div>
        </main>

        <AiSidebar />
      </div>

      <Footer />
      <FloatingAiButton />
    </div>
  );
}
