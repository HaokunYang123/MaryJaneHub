import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { QuickBooksStatusCard } from "@/components/dashboard/quickbooks-status-card";

export default function SettingsPage() {
  return (
    <div className="bg-white text-slate-900 h-screen flex flex-col overflow-hidden">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 scroll-smooth">
          {/* Page Heading */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Settings</h2>
              <p className="text-slate-500 text-sm mt-1">Manage integrations and preferences</p>
            </div>
          </div>

          {/* Settings Sections */}
          <div className="space-y-8">
            {/* Integrations Section */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400">hub</span>
                Integrations
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <QuickBooksStatusCard />
              </div>
            </section>

            {/* Account Section */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400">person</span>
                Account
              </h3>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-4">
                  <div className="size-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold">
                    M
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">Mary</p>
                    <p className="text-sm text-slate-500">Global Admin</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Preferences Section */}
            <section>
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-400">tune</span>
                Preferences
              </h3>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">Email Notifications</p>
                    <p className="text-sm text-slate-500">Receive alerts about important updates</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1B5E20]"></div>
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">Auto-sync Documents</p>
                    <p className="text-sm text-slate-500">Automatically process uploaded files</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1B5E20]"></div>
                  </label>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>

      <Footer />
    </div>
  );
}
