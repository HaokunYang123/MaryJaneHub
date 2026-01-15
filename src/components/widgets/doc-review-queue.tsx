"use client";

import { useMemo, useState } from "react";

type DocumentItem = {
  id: string;
  drive_file_id: string;
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | "DUPLICATE";
  doc_type: string;
  extracted_data: {
    vendorName?: string;
    vendor?: string;
    totalAmount?: number;
    amount?: number;
    invoiceDate?: string;
    date?: string;
    filingCategory?: string;
  };
  metadata?: {
    filingCategory?: string;
    amount?: number;
  };
  previewUrl?: string;
};

const mockItems: DocumentItem[] = [
  {
    id: "doc-101",
    drive_file_id: "drive-101",
    approval_status: "PENDING",
    doc_type: "Invoice",
    extracted_data: { vendorName: "Arizona Packaging", totalAmount: 450, invoiceDate: "2026-01-10" },
    previewUrl: "",
  },
  {
    id: "doc-102",
    drive_file_id: "drive-102",
    approval_status: "PENDING",
    doc_type: "Receipt",
    extracted_data: { vendorName: "Home Depot", totalAmount: 312.45, invoiceDate: "2026-01-09" },
    previewUrl: "",
  },
  {
    id: "doc-103",
    drive_file_id: "drive-103",
    approval_status: "DUPLICATE",
    doc_type: "Contract",
    extracted_data: { vendorName: "Mary's Real Estate LLC", totalAmount: 0 },
    previewUrl: "",
  },
];

function formatCurrency(value: number) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function getDocLabel(item: DocumentItem) {
  return item.doc_type || "Document";
}

function getVendor(item: DocumentItem) {
  return item.extracted_data?.vendorName || item.extracted_data?.vendor || "Unknown Vendor";
}

function getAmount(item: DocumentItem) {
  return item.extracted_data?.totalAmount || item.extracted_data?.amount || 0;
}

function getDate(item: DocumentItem) {
  return item.extracted_data?.invoiceDate || item.extracted_data?.date || "Unknown Date";
}

function getFilingCategory(item: DocumentItem) {
  return item.metadata?.filingCategory || item.extracted_data?.filingCategory || "Administrative";
}

export default function DocReviewQueue({ items, apiBaseUrl = "" }: { items?: DocumentItem[], apiBaseUrl?: string }) {
  const [queue, setQueue] = useState<DocumentItem[]>(items || mockItems);
  const [activeItem, setActiveItem] = useState<DocumentItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ vendorName: "", totalAmount: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const apiRoot = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);

  const pending = queue.filter((item) => item.approval_status === "PENDING");
  const duplicates = queue.filter((item) => item.approval_status === "DUPLICATE");

  const startEdit = (item: DocumentItem) => {
    setActiveItem(item);
    setEditForm({
      vendorName: getVendor(item),
      totalAmount: String(getAmount(item)),
    });
    setEditing(true);
  };

  const updateItemStatus = (id: string, status: DocumentItem["approval_status"]) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === id ? { ...item, approval_status: status } : item))
    );
  };

  const handleAction = async (item: DocumentItem, action: "approve" | "reject" | "resolveDuplicate") => {
    setLoadingId(item.id);
    const endpointMap = {
      approve: "/api/drive-intelligence/approve",
      reject: "/api/drive-intelligence/reject",
      resolveDuplicate: "/api/drive-intelligence/resolve-duplicate",
    };
    const endpoint = apiRoot + (endpointMap[action] || "");

    try {
      if (!endpointMap[action]) throw new Error("Unknown action");
      // Mock API call for now, since we haven't built the Drive API routes yet
      // await fetch(endpoint, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ id: item.id }),
      // });

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));

      if (action === "approve") updateItemStatus(item.id, "APPROVED");
      if (action === "reject") updateItemStatus(item.id, "REJECTED");
      if (action === "resolveDuplicate") updateItemStatus(item.id, "PENDING");
    } catch (error) {
      console.error("[DocReviewQueue] action failed", error);
    } finally {
      setLoadingId(null);
    }
  };

  const submitEdit = async () => {
    if (!activeItem) return;
    const updated: DocumentItem = {
      ...activeItem,
      extracted_data: {
        ...activeItem.extracted_data,
        vendorName: editForm.vendorName,
        totalAmount: Number(editForm.totalAmount) || 0,
      },
    };

    setQueue((prev) => prev.map((item) => (item.id === activeItem.id ? updated : item)));
    setEditing(false);
    setActiveItem(null);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-black text-slate-900">Pending Approval</h3>
          <p className="text-xs text-slate-500">Documents awaiting review</p>
        </div>
        <span className="px-2 py-1 text-xs font-bold rounded-full bg-[#1B5E20]/10 text-[#1B5E20]">
          {pending.length} PENDING
        </span>
      </div>

      <div className="space-y-4">
        {pending.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-1 md:grid-cols-[120px_1fr_220px] gap-4 border border-slate-200 rounded-lg p-4 bg-slate-50"
          >
            <div className="flex items-center justify-center bg-white border border-slate-200 rounded-lg h-28">
              {item.previewUrl ? (
                <img src={item.previewUrl} alt="Document preview" className="h-full w-full object-cover rounded-lg" />
              ) : (
                <span className="material-symbols-outlined text-slate-400 text-4xl">picture_as_pdf</span>
              )}
            </div>
            <div
              className="cursor-pointer group"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <p className="text-xs uppercase text-slate-400 font-bold">{getDocLabel(item)}</p>

              {/* EXPANDABLE NAME: Click to see full name if it's long */}
              <p className={`text-lg font-semibold text-slate-800 leading-tight transition-all ${expandedId === item.id ? "whitespace-normal" : "truncate max-w-[250px]"
                }`}>
                {getVendor(item)}
              </p>

              {/* AUTOMATION TARGET: Tells Mary what happens when she clicks Approve */}
              <div className="flex flex-col mt-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Destination: Drive/{getFilingCategory(item)}
                </p>
                <p className="text-[10px] text-[#1B5E20] font-medium italic mt-0.5">
                  {getAmount(item) > 0
                    ? "→ Will sync to QuickBooks & move to folder"
                    : "→ Will move to folder only"}
                </p>
              </div>

              <p className="text-sm text-slate-500 mt-1">{getDate(item)}</p>

              {/* FALLBACK FOR $0: Shows 'N/A' or '$0.00' clearly */}
              <p className="text-base font-bold text-[#1B5E20]">
                {getAmount(item) > 0 ? formatCurrency(getAmount(item)) : "Non-Financial / $0.00"}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleAction(item, "approve")}
                disabled={loadingId === item.id}
                className="px-3 py-2 rounded-lg bg-[#1B5E20] text-white text-xs font-bold hover:bg-[#1B5E20]/90 transition-colors"
              >
                Approve & Sync
              </button>
              <button
                onClick={() => startEdit(item)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => handleAction(item, "reject")}
                disabled={loadingId === item.id}
                className="px-3 py-2 rounded-lg border border-[#D32F2F]/40 text-xs font-bold text-[#D32F2F] bg-white hover:bg-[#D32F2F]/5 transition-colors"
              >
                Reject / Archive
              </button>
            </div>
          </div>
        ))}

        {pending.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-8">
            No pending approvals. Inbox is clean.
          </div>
        )}
      </div>

      {duplicates.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center gap-2 text-[#D32F2F] font-bold text-sm mb-3">
            <span className="material-symbols-outlined">warning</span>
            Duplicate Alerts
          </div>
          <div className="space-y-3">
            {duplicates.map((item) => (
              <div key={item.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-[#D32F2F]/30 rounded-lg p-4 bg-[#D32F2F]/5">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{getVendor(item)}</p>
                  <p className="text-xs text-slate-500">{getDocLabel(item)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(item, "resolveDuplicate")}
                    className="px-3 py-1.5 rounded-lg bg-[#1B5E20] text-white text-xs font-bold hover:bg-[#1B5E20]/90 transition-colors"
                  >
                    Keep Both
                  </button>
                  <button
                    onClick={() => handleAction(item, "reject")}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                  >
                    Delete New
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
              <h4 className="font-bold text-slate-900">Edit Extracted Data</h4>
              <button
                onClick={() => setEditing(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-400">Vendor</label>
                <input
                  value={editForm.vendorName}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, vendorName: event.target.value }))}
                  className="mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-400">Amount</label>
                <input
                  value={editForm.totalAmount}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, totalAmount: event.target.value }))}
                  className="mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setEditing(false)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={submitEdit}
                  className="px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold hover:bg-[#1B5E20]/90 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
