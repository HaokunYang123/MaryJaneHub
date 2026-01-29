"use client";

import { useState, useEffect, useRef } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AnimatedCurrency, AnimatedPercent } from "@/components/ui/animated-number";
import { PlaidLinkButton } from "@/components/bank/PlaidLinkButton";

interface Account {
  id: string;
  bank: string;
  name: string;
  accountNum: string;
  balance: number;
  type: string;
  entity: string;
}

interface AvailableRealm {
  realmId: string;
  name: string;
}

interface BankAccountsClientProps {
  accounts: Account[];
  availableRealms: AvailableRealm[];
}

// Demo data fallback when no real accounts exist
const DEMO_ACCOUNTS: Account[] = [
  { id: '1', bank: 'Chase Business', name: 'Main Operating - Phoenix', accountNum: '****4521', balance: 312450, type: 'Checking', entity: 'Mary\'s Dispensary LLC' },
  { id: '2', bank: 'Chase Business', name: 'Payroll Account', accountNum: '****4522', balance: 89200, type: 'Checking', entity: 'Mary\'s Dispensary LLC' },
  { id: '3', bank: 'Wells Fargo', name: 'Operating - Tucson', accountNum: '****7891', balance: 145800, type: 'Checking', entity: 'Desert Bloom AZ LLC' },
  { id: '4', bank: 'Chase Business', name: 'Tax Reserve', accountNum: '****4523', balance: 334353, type: 'Savings', entity: 'Mary\'s Holdings LLC' },
  { id: '5', bank: 'Bank of America', name: 'Working Capital', accountNum: '****2234', balance: 67500, type: 'Checking', entity: 'Mary\'s Real Estate LLC' },
  { id: '6', bank: 'US Bank', name: 'Cultivation Ops', accountNum: '****5567', balance: 28900, type: 'Checking', entity: 'AZ Grow Co LLC' },
];

export function BankAccountsClient({ accounts, availableRealms }: BankAccountsClientProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showRealmPicker, setShowRealmPicker] = useState(false);
  const [selectedRealm, setSelectedRealm] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  // Use demo data if no real accounts
  const displayAccounts = accounts.length > 0 ? accounts : DEMO_ACCOUNTS;
  const isDemo = accounts.length === 0;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (pageRef.current) observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, []);

  const totalBalance = displayAccounts.reduce((sum, a) => sum + a.balance, 0);
  const checkingTotal = displayAccounts.filter(a => a.type.toLowerCase() === 'checking').reduce((sum, a) => sum + a.balance, 0);
  const savingsTotal = displayAccounts.filter(a => a.type.toLowerCase() === 'savings').reduce((sum, a) => sum + a.balance, 0);

  const handleLinkClick = () => {
    if (availableRealms.length === 0) {
      alert('Please connect to QuickBooks first to link a bank account.');
      return;
    }
    if (availableRealms.length === 1) {
      setSelectedRealm(availableRealms[0].realmId);
    } else {
      setShowRealmPicker(true);
    }
  };

  const handleLinkSuccess = () => {
    setLinkSuccess(true);
    setSelectedRealm(null);
    setTimeout(() => setLinkSuccess(false), 3000);
  };

  return (
    <DashboardLayout hideFooter>
      <div ref={pageRef}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Bank Accounts</h2>
            <p className="text-slate-500 text-sm mt-1">
              {isDemo ? (
                <span className="text-amber-600">Demo mode - connect Plaid to see real accounts</span>
              ) : (
                'Consolidated view of all entity bank accounts'
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors">
              <span className="material-symbols-outlined text-sm">sync</span> Sync Balances
            </button>
            {selectedRealm ? (
              <PlaidLinkButton
                realmId={selectedRealm}
                onSuccess={handleLinkSuccess}
                onError={(err) => {
                  console.error('Plaid error:', err);
                  setSelectedRealm(null);
                }}
              />
            ) : (
              <button
                onClick={handleLinkClick}
                className="flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg hover:bg-[#2E7D32] transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span> Link Account
              </button>
            )}
          </div>
        </div>

        {/* Success message */}
        {linkSuccess && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-green-600">check_circle</span>
            Bank account linked successfully!
          </div>
        )}

        {/* Realm Picker Modal */}
        {showRealmPicker && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
              <h3 className="text-lg font-bold mb-4">Select Company</h3>
              <p className="text-slate-500 text-sm mb-4">Which company should this bank account be linked to?</p>
              <div className="space-y-2">
                {availableRealms.map((realm) => (
                  <button
                    key={realm.realmId}
                    onClick={() => {
                      setSelectedRealm(realm.realmId);
                      setShowRealmPicker(false);
                    }}
                    className="w-full p-3 text-left border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors"
                  >
                    <p className="font-medium">{realm.name}</p>
                    <p className="text-xs text-slate-400">ID: {realm.realmId}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowRealmPicker(false)}
                className="mt-4 w-full p-2 text-slate-500 hover:text-slate-700 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Balance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className={`bg-[#1B5E20] text-white rounded-xl p-6 shadow-lg transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <p className="text-xs text-white/60 font-bold uppercase">Total Balance</p>
            <p className="text-4xl font-black mt-1 tabular-nums">
              {isVisible ? <AnimatedCurrency value={totalBalance} duration={1500} className="text-white" /> : '$0.00'}
            </p>
            <p className="text-xs text-green-300 mt-2">
              +{isVisible ? <AnimatedPercent value={12.4} duration={1200} delay={300} showSign={false} className="text-green-300" /> : '0%'} from last month
            </p>
          </div>
          <div className={`bg-white rounded-xl border border-slate-200 p-6 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
            <p className="text-xs text-slate-400 font-bold uppercase">Checking Accounts</p>
            <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums">
              {isVisible ? <AnimatedCurrency value={checkingTotal} duration={1400} delay={100} /> : '$0.00'}
            </p>
            <p className="text-xs text-slate-400 mt-2">{displayAccounts.filter(a => a.type.toLowerCase() === 'checking').length} accounts</p>
          </div>
          <div className={`bg-white rounded-xl border border-slate-200 p-6 shadow-sm transition-all duration-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '200ms' }}>
            <p className="text-xs text-slate-400 font-bold uppercase">Savings / Reserves</p>
            <p className="text-3xl font-black text-slate-800 mt-1 tabular-nums">
              {isVisible ? <AnimatedCurrency value={savingsTotal} duration={1400} delay={200} /> : '$0.00'}
            </p>
            <p className="text-xs text-slate-400 mt-2">{displayAccounts.filter(a => a.type.toLowerCase() === 'savings').length} accounts</p>
          </div>
        </div>

        {/* Accounts List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center">
            <h3 className="font-bold">All Accounts</h3>
            <span className={`text-xs px-2 py-1 rounded font-bold transition-all duration-500 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-90'} ${isDemo ? 'bg-amber-100 text-amber-600' : 'bg-slate-200'}`}>
              {displayAccounts.length} {isDemo ? 'DEMO' : 'LINKED'}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 bg-slate-50 text-xs uppercase">
                <th className="px-6 py-3 text-left font-semibold">Bank</th>
                <th className="px-6 py-3 text-left font-semibold">Account Name</th>
                <th className="px-6 py-3 text-left font-semibold">Entity</th>
                <th className="px-6 py-3 text-center font-semibold">Type</th>
                <th className="px-6 py-3 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayAccounts.map((acc, idx) => (
                <tr
                  key={acc.id}
                  className={`hover:bg-slate-50 transition-all duration-500 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                  style={{ transitionDelay: `${300 + idx * 80}ms` }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-slate-600 text-lg">account_balance</span>
                      </div>
                      <span className="font-medium">{acc.bank}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium">{acc.name}</p>
                    <p className="text-xs text-slate-400">{acc.accountNum}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{acc.entity}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      acc.type.toLowerCase() === 'savings' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {acc.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-lg tabular-nums">
                    {isVisible ? <AnimatedCurrency value={acc.balance} duration={1200} delay={300 + idx * 80} /> : '$0.00'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
