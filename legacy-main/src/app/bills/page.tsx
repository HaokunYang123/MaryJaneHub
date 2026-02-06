"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";
import { AnimatedCurrency } from "@/components/ui/animated-number";

interface ExtractedInvoice {
    vendorName: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: number;
    lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
    suggestedCategory: string;
}

interface ProcessedFile {
    file: File;
    data: ExtractedInvoice | null;
    driveId: string | null; // Google Drive file ID
    status: 'pending' | 'processing' | 'success' | 'error';
    error?: string;
}

export default function BillsPage() {
    const [files, setFiles] = useState<ProcessedFile[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
    const [creating, setCreating] = useState<string | null>(null); // Track which file is being created
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Process multiple files
    const processFiles = useCallback(async (fileArray: File[]) => {
        if (fileArray.length === 0) return;

        setIsUploading(true);
        setUploadProgress({ current: 0, total: fileArray.length });
        setMessage(null);

        // Initialize files with pending status
        const initialFiles: ProcessedFile[] = fileArray.map(f => ({
            file: f,
            data: null,
            driveId: null,
            status: 'pending' as const
        }));
        setFiles(prev => [...prev, ...initialFiles]);

        // Process each file
        for (let i = 0; i < fileArray.length; i++) {
            const file = fileArray[i];
            setUploadProgress({ current: i + 1, total: fileArray.length });

            // Update status to processing
            setFiles(prev => prev.map(f =>
                f.file.name === file.name && f.status === 'pending'
                    ? { ...f, status: 'processing' as const }
                    : f
            ));

            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('/api/invoices/extract', {
                    method: 'POST',
                    body: formData,
                });

                const result = await response.json();

                if (result.success) {
                    setFiles(prev => prev.map(f =>
                        f.file.name === file.name && f.status === 'processing'
                            ? { ...f, data: result.data, driveId: result.driveId || null, status: 'success' as const }
                            : f
                    ));
                } else {
                    setFiles(prev => prev.map(f =>
                        f.file.name === file.name && f.status === 'processing'
                            ? { ...f, status: 'error' as const, error: result.error || 'Extraction failed' }
                            : f
                    ));
                }
            } catch {
                setFiles(prev => prev.map(f =>
                    f.file.name === file.name && f.status === 'processing'
                        ? { ...f, status: 'error' as const, error: 'Failed to process file' }
                        : f
                ));
            }
        }

        setIsUploading(false);
        setUploadProgress({ current: 0, total: 0 });
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles || selectedFiles.length === 0) return;
        await processFiles(Array.from(selectedFiles));
        e.target.value = '';
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
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const droppedFiles = Array.from(e.dataTransfer.files).filter(file => {
            const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
            return validTypes.includes(file.type);
        });

        if (droppedFiles.length > 0) {
            await processFiles(droppedFiles);
        }
    }, [processFiles]);

    const handleCreateBill = async (processedFile: ProcessedFile) => {
        if (!processedFile.data) return;

        const extractedData = processedFile.data;
        setCreating(processedFile.file.name);
        setMessage(null);

        try {
            const response = await fetch('/api/quickbooks/bills', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendorName: extractedData.vendorName,
                    dueDate: extractedData.dueDate,
                    invoiceNumber: extractedData.invoiceNumber,
                    lineItems: extractedData.lineItems.map(item => ({
                        description: item.description,
                        amount: item.amount,
                        category: extractedData.suggestedCategory,
                    })),
                    driveId: processedFile.driveId, // Pass Drive ID to move file after bill creation
                    category: extractedData.suggestedCategory, // For folder organization
                }),
            });

            const result = await response.json();

            if (result.success) {
                setMessage({ type: 'success', text: `Bill created for ${extractedData.vendorName}!` });
                // Remove the processed file from list
                setFiles(prev => prev.filter(f => f.file.name !== processedFile.file.name));
            } else {
                setMessage({ type: 'error', text: result.error || 'Failed to create bill' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to create bill in QuickBooks' });
        } finally {
            setCreating(null);
        }
    };

    const handleRemoveFile = (fileName: string) => {
        setFiles(prev => prev.filter(f => f.file.name !== fileName));
    };

    const successFiles = files.filter(f => f.status === 'success');
    const processingFiles = files.filter(f => f.status === 'processing' || f.status === 'pending');
    const errorFiles = files.filter(f => f.status === 'error');

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main
                    className="flex-1 overflow-y-auto bg-slate-50 p-6"
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
                                    <p className="text-2xl font-bold text-[#1B5E20]">Drop invoices here</p>
                                    <p className="text-slate-500 mt-2">PDF, PNG, JPG supported</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mb-8">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Automated Bill Creation</h2>
                        <p className="text-slate-500 text-sm mt-1">Upload invoices to automatically create bills in QuickBooks</p>
                    </div>

                    {message && (
                        <div className={`mb-6 p-4 rounded-lg flex items-center justify-between ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                            <span>{message.text}</span>
                            <button onClick={() => setMessage(null)} className="text-current opacity-50 hover:opacity-100">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>
                    )}

                    {/* Upload Progress Bar */}
                    {isUploading && uploadProgress.total > 0 && (
                        <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
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
                                AI is extracting invoice details...
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {/* Upload Section */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1B5E20]">upload_file</span>
                                Upload Invoices
                            </h3>

                            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragging ? 'border-[#1B5E20] bg-[#1B5E20]/5' : 'border-slate-200 hover:border-[#1B5E20]'}`}>
                                <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    id="invoice-upload"
                                    multiple
                                    disabled={isUploading}
                                />
                                <label htmlFor="invoice-upload" className="cursor-pointer block">
                                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">cloud_upload</span>
                                    <p className="text-sm font-medium text-slate-600">
                                        Drag & drop invoices here or click to browse
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">Supports multiple files (PDF, PNG, JPG)</p>
                                </label>
                            </div>

                            {/* Browse Files Button */}
                            <div className="mt-4 flex justify-center">
                                <label
                                    htmlFor="invoice-upload"
                                    className={`inline-flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg font-medium text-sm cursor-pointer hover:bg-[#154a19] transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <span className="material-symbols-outlined text-lg">folder_open</span>
                                    Browse Files
                                </label>
                            </div>

                            {/* Processing Files */}
                            {processingFiles.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {processingFiles.map((pf, idx) => (
                                        <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-sm">
                                            <div className="animate-spin size-4 border-2 border-[#1B5E20] border-t-transparent rounded-full"></div>
                                            <span className="text-slate-600 truncate flex-1">{pf.file.name}</span>
                                            <span className="text-blue-600 text-xs">Processing...</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Error Files */}
                            {errorFiles.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {errorFiles.map((ef, idx) => (
                                        <div key={idx} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg text-sm">
                                            <span className="material-symbols-outlined text-red-500 text-lg">error</span>
                                            <span className="text-slate-600 truncate flex-1">{ef.file.name}</span>
                                            <span className="text-red-600 text-xs">{ef.error}</span>
                                            <button onClick={() => handleRemoveFile(ef.file.name)} className="text-red-400 hover:text-red-600">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Extracted Data Section */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1B5E20]">receipt_long</span>
                                Extracted Data
                            </h3>

                            {successFiles.length > 0 ? (
                                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                                    {successFiles.map((pf, idx) => (
                                        <div key={idx} className="border border-slate-200 rounded-lg p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs text-slate-400 truncate max-w-[200px]">{pf.file.name}</span>
                                                <button
                                                    onClick={() => handleRemoveFile(pf.file.name)}
                                                    className="text-slate-400 hover:text-red-500"
                                                >
                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                </button>
                                            </div>

                                            {pf.data && (
                                                <>
                                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                                        <div>
                                                            <label className="text-xs text-slate-400 font-bold uppercase">Vendor</label>
                                                            <p className="font-medium">{pf.data.vendorName}</p>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-slate-400 font-bold uppercase">Invoice #</label>
                                                            <p className="font-medium">{pf.data.invoiceNumber}</p>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-slate-400 font-bold uppercase">Due Date</label>
                                                            <p className="font-medium">{pf.data.dueDate}</p>
                                                        </div>
                                                        <div>
                                                            <label className="text-xs text-slate-400 font-bold uppercase">Total</label>
                                                            <p className="font-bold text-[#1B5E20] text-lg tabular-nums">
                                                                <AnimatedCurrency value={pf.data.totalAmount} duration={1200} />
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-2">
                                                        <span className="px-2 py-1 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-xs font-bold">
                                                            {pf.data.suggestedCategory}
                                                        </span>
                                                    </div>

                                                    <button
                                                        onClick={() => handleCreateBill(pf)}
                                                        disabled={creating === pf.file.name}
                                                        className="w-full mt-3 py-2 bg-[#1B5E20] text-white font-bold rounded-lg hover:bg-[#1B5E20]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                                                    >
                                                        {creating === pf.file.name ? (
                                                            <>
                                                                <div className="animate-spin size-4 border-2 border-white border-t-transparent rounded-full"></div>
                                                                Creating...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="material-symbols-outlined text-sm">send</span>
                                                                Create Bill in QuickBooks
                                                            </>
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                                    <p className="text-sm">Upload invoices to see extracted data</p>
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
