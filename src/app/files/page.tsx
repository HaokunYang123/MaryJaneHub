'use client';

import { useState, useEffect } from 'react';
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DocumentAnalysis {
  summary: string;
  category: string;
  confidence: number;
  data: {
    vendorName: string;
    amount: number;
    date: string;
    description: string;
  };
}

interface PendingDocument {
  id: string;
  drive_id: string;
  category: string;
  metadata: DocumentAnalysis;
  is_duplicate: boolean;
  duplicate_of_id: string | null;
  created_at: string;
}

export default function FilesPage() {
  const [pendingDocs, setPendingDocs] = useState<PendingDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Load Pending Docs on Mount
  useEffect(() => {
    fetchPendingDocs();
  }, []);

  const fetchPendingDocs = async () => {
    setIsLoading(true);
    setQueueError(null);
    try {
      const res = await fetch('/api/files/pending');
      const data = await res.json();

      if (!res.ok) {
        setQueueError(data?.error || 'Failed to load review queue.');
        setPendingDocs([]);
        return;
      }

      setPendingDocs(data.documents || []);
    } catch (error) {
      console.error("Failed to fetch documents:", error);
      setQueueError('Failed to load review queue.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;

    const file = e.target.files[0];
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // FIX: Do NOT set Content-Type header manually for FormData!
      // The browser automatically generates it with a special "boundary" string
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      // Success! Refresh the list
      await fetchPendingDocs();

    } catch (error) {
      console.error("Upload Error:", error);
      alert("Upload failed. Check console for details.");
    } finally {
      setIsUploading(false);
      e.target.value = ''; // Reset input
    }
  };

  const handleConfirm = async (docId: string) => {
    try {
      // Optimistic UI update
      setPendingDocs(prev => prev.filter(d => d.id !== docId));

      const res = await fetch('/api/files/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId })
      });

      if (!res.ok) {
        throw new Error("Sync failed");
      }
    } catch (error) {
      console.error(error);
      fetchPendingDocs(); // Revert on error
    }
  };

  const handleReject = async (docId: string) => {
    try {
      // Optimistic UI update
      setPendingDocs(prev => prev.filter(d => d.id !== docId));

      const res = await fetch('/api/files/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId })
      });

      if (!res.ok) {
        throw new Error("Reject failed");
      }
    } catch (error) {
      console.error(error);
      fetchPendingDocs(); // Revert on error
    }
  };

  return (
    <div className="bg-white text-slate-900 h-screen flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 scroll-smooth">
          <div className="max-w-7xl mx-auto space-y-8">

            {/* HEADER & UPLOAD */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-[#1B5E20]">Document Control</h1>
                <p className="text-slate-500">Upload invoices here. Review them before they hit your books.</p>
              </div>

              <div className="relative">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  disabled={isUploading}
                />
                <label htmlFor="file-upload">
                  <Button asChild className="bg-[#1B5E20] hover:bg-[#154a19] cursor-pointer" disabled={isUploading}>
                    <span className="flex items-center gap-2">
                      {isUploading ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-lg">upload_file</span>
                          Upload New File
                        </>
                      )}
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            {/* REVIEW QUEUE */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-slate-800">Review Queue</h2>
                <Badge variant="secondary" className="bg-slate-200 text-slate-700">
                  {pendingDocs.length} Pending
                </Badge>
              </div>

              {queueError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {queueError} Check your Supabase keys, schema, and server logs.
                </div>
              )}

              {isLoading ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-slate-50/50">
                  <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin mb-3">progress_activity</span>
                  <p className="text-slate-500 font-medium">Loading documents...</p>
                </div>
              ) : pendingDocs.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl bg-slate-50/50">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-3">task_alt</span>
                  <p className="text-slate-500 font-medium">All caught up! No documents waiting for review.</p>
                  <p className="text-slate-400 text-sm mt-1">Upload a file to get started</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {pendingDocs.map((doc) => (
                    <ReviewCard
                      key={doc.id}
                      doc={doc}
                      onConfirm={handleConfirm}
                      onReject={handleReject}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

// Sub-component for individual cards
function ReviewCard({
  doc,
  onConfirm,
  onReject
}: {
  doc: PendingDocument;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const analysis = doc.metadata;
  const isDuplicate = doc.is_duplicate;

  const vendorName = analysis?.data?.vendorName || "Unknown Vendor";
  const amount = analysis?.data?.amount || 0;
  const description = analysis?.data?.description || "services";

  // Custom sentence construction for the summary
  const customSummary = `Invoice from ${vendorName} for ${description} and it is being sent to QuickBooks for book keeping.`;

  // Display path for Drive
  const drivePath = `Drive/Invoices/${analysis?.category || 'General'}`;

  return (
    <Card className={`p-5 border-l-4 ${isDuplicate ? 'border-l-red-500 bg-red-50/30' : 'border-l-[#1B5E20]'} shadow-sm hover:shadow-md transition-shadow`}>

      {/* Card Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3 w-full min-w-0">
          <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center border shadow-sm shrink-0">
            <span className="material-symbols-outlined text-slate-600">description</span>
          </div>
          <div className="min-w-0 flex-1">
            {/* Vendor Name: Displays full name, truncates ONLY if it overflows the card width */}
            <p className="font-semibold text-slate-900 truncate" title={vendorName}>
              {vendorName}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(doc.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        {isDuplicate && (
          <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200 shrink-0 ml-2">
            Duplicate
          </Badge>
        )}
      </div>

      {/* AI Analysis Summary */}
      <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-2 mb-4 border border-slate-100">
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Amount</span>
          <span className="font-bold text-[#1B5E20] text-lg">
            ${amount.toFixed(2)}
          </span>
        </div>

        {/* Changed from "Destination" to "Category" as requested, showing path */}
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Category</span>
          <Badge variant="outline" className="text-xs font-normal max-w-[150px] truncate" title={drivePath}>
            {drivePath}
          </Badge>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-slate-500">Date</span>
          <span className="text-slate-700">{analysis?.data?.date || 'N/A'}</span>
        </div>
        {/* Confidence score removed */}
      </div>

      {/* Custom Sentence Summary */}
      <p className="text-xs text-slate-600 mb-4 line-clamp-3 leading-relaxed">
        {customSummary}
      </p>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        {isDuplicate && (
          <p className="text-xs text-red-600 font-medium flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">warning</span>
            We processed a similar bill recently.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="w-full text-slate-600 hover:text-red-600 hover:bg-red-50 border-slate-200"
            onClick={() => onReject(doc.id)}
          >
            <span className="material-symbols-outlined text-sm mr-1">close</span>
            Reject
          </Button>
          <Button
            className="w-full bg-[#1B5E20] hover:bg-[#154a19]"
            onClick={() => onConfirm(doc.id)}
          >
            <span className="material-symbols-outlined text-sm mr-1">check</span>
            Confirm
          </Button>
        </div>
      </div>
    </Card>
  );
}
