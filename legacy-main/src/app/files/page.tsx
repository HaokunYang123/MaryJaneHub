'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

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

  // Process files (shared by input and drag/drop)
  const processFiles = useCallback(async (fileArray: File[]) => {
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });

    let successCount = 0;
    let failCount = 0;

    // Upload files sequentially to avoid overwhelming the server
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setUploadProgress({ current: i + 1, total: fileArray.length });

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/files/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Upload failed");
        }
        successCount++;
      } catch (error) {
        console.error(`Upload Error for ${file.name}:`, error);
        failCount++;
      }
    }

    // Refresh the list after all uploads
    await fetchPendingDocs();

    // Show summary
    if (failCount > 0) {
      alert(`Uploaded ${successCount} of ${fileArray.length} files. ${failCount} failed.`);
    }

    setIsUploading(false);
    setUploadProgress({ current: 0, total: 0 });
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await processFiles(Array.from(files));
    e.target.value = ''; // Reset input
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file => {
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'text/plain'];
      return validTypes.includes(file.type);
    });

    if (files.length > 0) {
      await processFiles(files);
    }
  }, [processFiles]);

  const handleConfirm = async (docId: string, destination: string) => {
    try {
      // Optimistic UI update
      setPendingDocs(prev => prev.filter(d => d.id !== docId));

      const res = await fetch('/api/files/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId, destination })
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

  // Dismiss a single document (for orphaned records where Drive file was deleted)
  const handleDismiss = async (docId: string) => {
    try {
      setPendingDocs(prev => prev.filter(d => d.id !== docId));

      const res = await fetch('/api/files/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId })
      });

      if (!res.ok) {
        throw new Error("Dismiss failed");
      }
    } catch (error) {
      console.error(error);
      fetchPendingDocs();
    }
  };

  // Clean up ALL orphaned documents (where Drive file no longer exists)
  const handleCleanupOrphaned = async () => {
    if (!confirm('This will remove all pending documents whose files were deleted from Google Drive. Continue?')) {
      return;
    }

    setIsCleaningUp(true);
    try {
      const res = await fetch('/api/files/dismiss', { method: 'DELETE' });
      const data = await res.json();

      if (res.ok) {
        alert(`Cleanup complete: ${data.removed} orphaned records removed.`);
        fetchPendingDocs();
      } else {
        alert(`Cleanup failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
      alert('Cleanup failed. Check console for details.');
    } finally {
      setIsCleaningUp(false);
    }
  };

  return (
    <div className="bg-white text-slate-900 h-screen flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main
          className="flex-1 overflow-y-auto bg-slate-50 p-6 scroll-smooth"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Full-screen drag overlay */}
          {isDragging && (
            <div className="fixed inset-0 z-50 bg-[#1B5E20]/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-2xl border-4 border-dashed border-[#1B5E20] p-12 shadow-2xl">
                <div className="text-center">
                  <span className="material-symbols-outlined text-6xl text-[#1B5E20] mb-4">cloud_upload</span>
                  <p className="text-2xl font-bold text-[#1B5E20]">Drop files here</p>
                  <p className="text-slate-500 mt-2">PDF, PNG, JPG supported</p>
                </div>
              </div>
            </div>
          )}

          <div className="max-w-7xl mx-auto space-y-8">

            {/* HEADER & UPLOAD */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-[#1B5E20]">Document Control</h1>
                <p className="text-slate-500">Upload invoices here or drag & drop files. Review them before they hit your books.</p>
              </div>

              <div className="relative">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.txt"
                  disabled={isUploading}
                  multiple
                />
                <label htmlFor="file-upload">
                  <Button asChild className="bg-[#1B5E20] hover:bg-[#154a19] cursor-pointer" disabled={isUploading}>
                    <span className="flex items-center gap-2">
                      {isUploading ? (
                        <>
                          <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                          {uploadProgress.total > 1
                            ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...`
                            : 'Analyzing...'}
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-lg">upload_file</span>
                          Upload Files
                        </>
                      )}
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            {/* Upload Progress Bar */}
            {isUploading && uploadProgress.total > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1B5E20] animate-pulse">cloud_upload</span>
                    <span className="font-medium text-slate-700">
                      Processing {uploadProgress.current} of {uploadProgress.total} files
                    </span>
                  </div>
                  <span className="text-sm font-bold text-[#1B5E20]">
                    {Math.round((uploadProgress.current / uploadProgress.total) * 100)}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#1B5E20] to-emerald-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  AI is analyzing your documents and extracting invoice details...
                </p>
              </div>
            )}

            {/* REVIEW QUEUE */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-800">Review Queue</h2>
                  <Badge variant="secondary" className="bg-slate-200 text-slate-700">
                    {pendingDocs.length} Pending
                  </Badge>
                </div>
                {pendingDocs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCleanupOrphaned}
                    disabled={isCleaningUp}
                    className="text-slate-600 hover:text-red-600 hover:border-red-300"
                  >
                    {isCleaningUp ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-sm mr-1">progress_activity</span>
                        Cleaning...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm mr-1">delete_sweep</span>
                        Clean Up Orphaned
                      </>
                    )}
                  </Button>
                )}
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
                      onDismiss={handleDismiss}
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

// Alternative destinations when user says "No" to QuickBooks
const ALTERNATIVE_DESTINATIONS = [
  { value: 'drive_only', label: 'Store to Drive Only', description: 'File it without syncing to QuickBooks' },
  { value: 'archive', label: 'Archive for Records', description: 'Keep for reference, no action needed' },
  { value: 'manual_entry', label: 'Manual Entry Later', description: 'Flag for manual QuickBooks entry' },
  { value: 'not_billable', label: 'Not Billable', description: 'Personal or non-business expense' },
] as const;

// Sub-component for individual cards
function ReviewCard({
  doc,
  onConfirm,
  onReject,
  onDismiss
}: {
  doc: PendingDocument;
  onConfirm: (id: string, destination: string) => void;
  onReject: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  // State for QuickBooks question
  const [sendToQuickBooks, setSendToQuickBooks] = useState<boolean | null>(null);
  const [alternativeDestination, setAlternativeDestination] = useState('drive_only');

  // State for duplicate QB check
  const [duplicateQbStatus, setDuplicateQbStatus] = useState<'idle' | 'checking' | 'exists' | 'sending' | 'sent' | 'not_connected'>('idle');
  const [qbBillInfo, setQbBillInfo] = useState<{ billId?: string; billNumber?: string } | null>(null);

  const analysis = doc.metadata;
  const isDuplicate = doc.is_duplicate;

  const vendorName = analysis?.data?.vendorName || "Unknown Vendor";
  const amount = analysis?.data?.amount || 0;
  const description = analysis?.data?.description || "services";

  // Get simplified category fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = analysis as any;
  const category = meta?.category || "Other";
  const property = meta?.property;
  const expenseType = meta?.expenseType;
  // Show QuickBooks option if there's any money involved (amount > 0)
  // Don't rely solely on AI's needsBookkeeping determination
  const needsBookkeeping = amount > 0;

  // Duplicate info
  const duplicateInfo = meta?.duplicateInfo;
  const duplicateReason = duplicateInfo?.reason || null;
  const duplicateDriveLink = duplicateInfo?.existingDriveLink || null;

  // Build display label
  const getDisplayLabel = () => {
    if (category === "Properties" && property) {
      return expenseType ? `${property} - ${expenseType}` : property;
    }
    if (category === "Dispensary" && expenseType) {
      return `Dispensary - ${expenseType}`;
    }
    return category;
  };

  // Determine final destination
  const getFinalDestination = () => {
    if (!needsBookkeeping) return 'drive_only';
    return sendToQuickBooks ? 'quickbooks' : alternativeDestination;
  };

  // Summary text
  const getSummaryText = () => {
    if (!needsBookkeeping) {
      // No amount - just store for reference
      return `${description} from ${vendorName}. No amount detected - will be stored in Drive for reference.`;
    }
    if (sendToQuickBooks === null) {
      return `$${amount.toFixed(2)} from ${vendorName} for ${description}.`;
    }
    if (sendToQuickBooks) {
      return `$${amount.toFixed(2)} from ${vendorName} for ${description} will be sent to QuickBooks.`;
    }
    const altLabel = ALTERNATIVE_DESTINATIONS.find(d => d.value === alternativeDestination)?.label || 'stored';
    return `$${amount.toFixed(2)} from ${vendorName} for ${description} will be ${altLabel.toLowerCase()}.`;
  };

  // Can user confirm? (Yes if no bookkeeping needed, or if they answered the QB question)
  const canConfirm = !needsBookkeeping || sendToQuickBooks !== null;

  // Handle duplicate file QB send
  const handleDuplicateSendToQb = async () => {
    setDuplicateQbStatus('checking');

    try {
      // Check if invoice already exists in QuickBooks
      const checkRes = await fetch('/api/quickbooks/check-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorName, amount, date: analysis?.data?.date })
      });

      const checkData = await checkRes.json();

      // Handle not connected to QuickBooks
      if (checkData.notConnected) {
        setDuplicateQbStatus('not_connected');
        return;
      }

      if (checkData.exists) {
        // Invoice already in QuickBooks - show success with bill info
        setQbBillInfo({ billId: checkData.billId, billNumber: checkData.billNumber });
        setDuplicateQbStatus('exists');
        // Auto-dismiss after 4 seconds
        setTimeout(() => {
          onReject(doc.id); // Remove from queue since it's handled
        }, 4000);
      } else {
        // Not in QuickBooks yet - send it now
        setDuplicateQbStatus('sending');
        await onConfirm(doc.id, 'quickbooks');
        setDuplicateQbStatus('sent');
        // Auto-dismiss after 3 seconds
        setTimeout(() => {
          onReject(doc.id);
        }, 3000);
      }
    } catch (error) {
      console.error('QB check failed:', error);
      // If check fails, just send to QB anyway
      setDuplicateQbStatus('sending');
      await onConfirm(doc.id, 'quickbooks');
      setDuplicateQbStatus('sent');
    }
  };

  // Handle duplicate "No" - just dismiss since file already exists in Drive
  const handleDuplicateNoQb = () => {
    onReject(doc.id); // Remove from queue - file already exists
  };

  // ============ DUPLICATE FILE CARD ============
  if (isDuplicate) {
    // Determine card style based on status
    const isSuccess = duplicateQbStatus === 'exists' || duplicateQbStatus === 'sent';
    const cardClass = isSuccess
      ? 'border-l-[#1B5E20] bg-green-50/50 transition-colors duration-1000'
      : 'border-l-red-500 bg-red-50/30';

    return (
      <Card className={`p-5 border-l-4 ${cardClass} shadow-sm hover:shadow-md transition-shadow`}>
        {/* Card Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3 w-full min-w-0">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center border shadow-sm shrink-0 ${isSuccess ? 'bg-green-100' : 'bg-white'}`}>
              <span className={`material-symbols-outlined ${isSuccess ? 'text-green-600' : 'text-slate-600'}`}>
                {isSuccess ? 'check_circle' : 'description'}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 truncate" title={vendorName}>
                {vendorName}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(doc.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge
            variant={isSuccess ? "default" : "destructive"}
            className={isSuccess ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}
          >
            {isSuccess ? 'All Set' : 'Duplicate'}
          </Badge>
        </div>

        {/* Analysis Summary */}
        <div className="bg-white/70 rounded-lg p-3 text-sm space-y-2 mb-4 border border-slate-100">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Amount</span>
            <span className="font-bold text-[#1B5E20] text-lg">${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Category</span>
            <Badge variant="outline" className="text-xs">{getDisplayLabel()}</Badge>
          </div>
        </div>

        {/* Success State - Already Exists */}
        {duplicateQbStatus === 'exists' && (
          <div className="p-4 bg-green-100 rounded-lg border border-green-200 text-center">
            <span className="material-symbols-outlined text-green-600 text-3xl mb-2">verified</span>
            <p className="text-sm font-semibold text-green-700">
              Already in QuickBooks!
            </p>
            {qbBillInfo?.billNumber && (
              <p className="text-xs text-green-600 mt-1">
                Bill #{qbBillInfo.billNumber}
              </p>
            )}
            <p className="text-xs text-green-500 mt-2">
              Dismissing automatically...
            </p>
          </div>
        )}

        {/* Success State - Just Sent */}
        {duplicateQbStatus === 'sent' && (
          <div className="p-4 bg-green-100 rounded-lg border border-green-200 text-center">
            <span className="material-symbols-outlined text-green-600 text-3xl mb-2">check_circle</span>
            <p className="text-sm font-semibold text-green-700">
              Created in QuickBooks!
            </p>
            <p className="text-xs text-green-500 mt-1">
              Dismissing automatically...
            </p>
          </div>
        )}

        {/* Not Connected State */}
        {duplicateQbStatus === 'not_connected' && (
          <div className="p-4 bg-orange-50 rounded-lg border border-orange-200 text-center">
            <span className="material-symbols-outlined text-orange-600 text-3xl mb-2">link_off</span>
            <p className="text-sm font-semibold text-orange-700">
              QuickBooks Not Connected
            </p>
            <p className="text-xs text-orange-600 mt-1 mb-3">
              Connect QuickBooks from the dashboard to sync invoices.
            </p>
            <div className="flex gap-2 justify-center">
              <a
                href="/"
                className="px-3 py-1.5 bg-orange-600 text-white rounded text-xs font-medium hover:bg-orange-700"
              >
                Go to Dashboard
              </a>
              <button
                onClick={() => setDuplicateQbStatus('idle')}
                className="px-3 py-1.5 bg-white border border-orange-300 text-orange-700 rounded text-xs font-medium hover:bg-orange-50"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* Checking/Sending State */}
        {(duplicateQbStatus === 'checking' || duplicateQbStatus === 'sending') && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 text-center">
            <span className="material-symbols-outlined text-blue-600 text-2xl animate-spin mb-2">progress_activity</span>
            <p className="text-sm text-blue-700">
              {duplicateQbStatus === 'checking' ? 'Checking QuickBooks...' : 'Creating bill in QuickBooks...'}
            </p>
          </div>
        )}

        {/* Idle State - Show duplicate info and QB question */}
        {duplicateQbStatus === 'idle' && (
          <>
            {/* Duplicate Info */}
            <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-red-500 text-lg mt-0.5">info</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700 mb-1">
                    This file already exists in Drive
                  </p>
                  {duplicateReason && (
                    <p className="text-xs text-red-600 mb-2">{duplicateReason}</p>
                  )}
                  {duplicateDriveLink && (
                    <a
                      href={duplicateDriveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      <span className="material-symbols-outlined text-sm">open_in_new</span>
                      View existing file
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Only QuickBooks Question - No Reject/Confirm */}
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-sm font-medium text-slate-700 mb-3">
                Do you want to send this to QuickBooks?
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-[#1B5E20] hover:bg-[#154a19]"
                  onClick={handleDuplicateSendToQb}
                >
                  <span className="material-symbols-outlined text-sm mr-1">send</span>
                  Yes, Send to QB
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={handleDuplicateNoQb}
                >
                  No, Dismiss
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    );
  }

  // ============ NORMAL (NON-DUPLICATE) FILE CARD ============
  return (
    <Card className="p-5 border-l-4 border-l-[#1B5E20] shadow-sm hover:shadow-md transition-shadow">
      {/* Card Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3 w-full min-w-0">
          <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center border shadow-sm shrink-0">
            <span className="material-symbols-outlined text-slate-600">description</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 truncate" title={vendorName}>
              {vendorName}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(doc.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Analysis Summary */}
      <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-2 mb-4 border border-slate-100">
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Amount</span>
          <span className="font-bold text-[#1B5E20] text-lg">${amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Filing To</span>
          <Badge variant="outline" className="text-xs">{getDisplayLabel()}</Badge>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-slate-500">Date</span>
          <span className="text-slate-700">{analysis?.data?.date || 'N/A'}</span>
        </div>
      </div>

      {/* Summary Text */}
      <p className="text-xs text-slate-600 mb-4 leading-relaxed">{getSummaryText()}</p>

      {/* QuickBooks Question - ONLY shown if needsBookkeeping is true */}
      {needsBookkeeping && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm font-medium text-slate-700 mb-2">
            Send this to QuickBooks as an invoice?
          </p>

          {sendToQuickBooks === null ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 bg-[#1B5E20] hover:bg-[#154a19]"
                onClick={() => setSendToQuickBooks(true)}
              >
                Yes
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setSendToQuickBooks(false)}
              >
                No
              </Button>
            </div>
          ) : sendToQuickBooks ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#1B5E20] font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Sending to QuickBooks
              </span>
              <button
                className="text-xs text-slate-500 hover:text-slate-700 underline"
                onClick={() => setSendToQuickBooks(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={alternativeDestination}
                onChange={(e) => setAlternativeDestination(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 focus:border-[#1B5E20]"
              >
                {ALTERNATIVE_DESTINATIONS.map((dest) => (
                  <option key={dest.value} value={dest.value}>
                    {dest.label}
                  </option>
                ))}
              </select>
              <button
                className="text-xs text-slate-500 hover:text-slate-700 underline"
                onClick={() => setSendToQuickBooks(null)}
              >
                Back to Yes/No
              </button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
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
          onClick={() => onConfirm(doc.id, getFinalDestination())}
          disabled={!canConfirm}
        >
          <span className="material-symbols-outlined text-sm mr-1">check</span>
          Confirm
        </Button>
      </div>
    </Card>
  );
}
