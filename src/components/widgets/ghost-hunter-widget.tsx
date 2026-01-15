"use client";

import { useEffect, useState } from "react";

type GhostTransaction = {
  id: string;
  name: string;
  amount: number;
  date: string;
};

function formatCurrency(value: number) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(amount));
}

export default function GhostHunterWidget({ apiBaseUrl = "", onPushToQB, initialGhosts }: { apiBaseUrl?: string, onPushToQB?: (ghost: GhostTransaction) => void, initialGhosts?: GhostTransaction[] }) {
  const [ghosts, setGhosts] = useState<GhostTransaction[]>(initialGhosts || []);
  const [loading, setLoading] = useState(!initialGhosts);

  useEffect(() => {
    if (initialGhosts) return;

    const fetchGhosts = async () => {
      setLoading(true);
      try {
        // Use the AI Agent API to get ghost transactions naturally
        const response = await fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Find ghost transactions",
            history: [],
          }),
        });
        const data = await response.json();
        // The agent returns a JSON string in the reply for specific data queries
        try {
            const parsed = JSON.parse(data.reply);
            if (Array.isArray(parsed)) {
                setGhosts(parsed);
            }
        } catch (e) {
            // Fallback if not pure JSON
            console.log("Agent reply not JSON:", data.reply);
        }
      } catch (error) {
        console.error("[GhostHunterWidget] Failed to load ghosts", error);
      } finally {
        setLoading(false);
      }
    };

    fetchGhosts();
  }, [apiBaseUrl, initialGhosts]);

  const ghostCount = ghosts?.length || 0;
  const hasGhosts = ghostCount > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-black text-slate-900">Ghost Transactions</h3>
          <p className="text-xs text-slate-500">Bank activity missing from QuickBooks</p>
        </div>
        {hasGhosts ? (
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-[#D32F2F]/10 text-[#D32F2F]">
            {ghostCount} GHOSTS
          </span>
        ) : (
          <span className="px-2 py-1 rounded-full text-xs font-bold bg-[#1B5E20]/10 text-[#1B5E20]">
            CLEAN
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400">Scanning for ghost transactions...</div>
      ) : hasGhosts ? (
        <div className="space-y-3">
          {ghosts.map((ghost, index) => (
            <div
              key={ghost.id || index}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">{ghost.name}</p>
                <p className="text-xs text-slate-500">{ghost.date}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-[#D32F2F]">{formatCurrency(ghost.amount)}</span>
                <button
                  onClick={() => onPushToQB?.(ghost)}
                  className="px-3 py-1.5 bg-[#1B5E20] text-white rounded-lg text-xs font-bold shadow-sm hover:bg-[#1B5E20]/90"
                >
                  Push to QB
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="size-12 rounded-full bg-[#1B5E20]/10 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[#1B5E20] text-3xl">check_circle</span>
          </div>
          <p className="text-sm font-semibold text-[#1B5E20]">Books match Bank</p>
          <p className="text-xs text-slate-500">No ghost transactions detected.</p>
        </div>
      )}
    </div>
  );
}
