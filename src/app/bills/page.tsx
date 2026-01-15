"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Footer } from "@/components/layout/footer";

interface ExtractedInvoice {
    vendorName: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: number;
    lineItems: { description: string; quantity: number; unitPrice: number; amount: number }[];
    suggestedCategory: string;
}

export default function BillsPage() {
    const [file, setFile] = useState<File | null>(null);
    const [extractedData, setExtractedData] = useState<ExtractedInvoice | null>(null);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setLoading(true);
        setMessage(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch('/api/invoices/extract', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setExtractedData(result.data);
            } else {
                setMessage({ type: 'error', text: result.error || 'Failed to extract invoice data' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to process invoice' });
        } finally {
            setLoading(false);
        }
    };

    const handleCreateBill = async () => {
        if (!extractedData) return;

        setCreating(true);
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
                }),
            });

            const result = await response.json();

            if (result.success) {
                setMessage({ type: 'success', text: `Bill created successfully for ${extractedData.vendorName}!` });
                setExtractedData(null);
                setFile(null);
            } else {
                setMessage({ type: 'error', text: result.error || 'Failed to create bill' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to create bill in QuickBooks' });
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="bg-white text-slate-900 min-h-screen flex flex-col">
            <Header />
            <div className="flex flex-1 overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
                    <div className="mb-8">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">Automated Bill Creation</h2>
                        <p className="text-slate-500 text-sm mt-1">Upload invoices to automatically create bills in QuickBooks</p>
                    </div>

                    {message && (
                        <div className={`mb-6 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                            {message.text}
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        {/* Upload Section */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1B5E20]">upload_file</span>
                                Upload Invoice
                            </h3>

                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-[#1B5E20] transition-colors">
                                <input
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                    id="invoice-upload"
                                />
                                <label htmlFor="invoice-upload" className="cursor-pointer">
                                    <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">cloud_upload</span>
                                    <p className="text-sm font-medium text-slate-600">
                                        {file ? file.name : 'Drop invoice PDF here or click to upload'}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-1">Supports PDF, PNG, JPG</p>
                                </label>
                            </div>

                            {loading && (
                                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                                    <div className="animate-spin size-4 border-2 border-[#1B5E20] border-t-transparent rounded-full"></div>
                                    Extracting invoice data with AI...
                                </div>
                            )}
                        </div>

                        {/* Extracted Data Section */}
                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#FFB300]">auto_awesome</span>
                                Extracted Data
                            </h3>

                            {extractedData ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs text-slate-400 font-bold uppercase">Vendor</label>
                                            <p className="font-medium">{extractedData.vendorName}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-bold uppercase">Invoice #</label>
                                            <p className="font-medium">{extractedData.invoiceNumber}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-bold uppercase">Due Date</label>
                                            <p className="font-medium">{extractedData.dueDate}</p>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-bold uppercase">Total Amount</label>
                                            <p className="font-bold text-[#1B5E20] text-lg">${extractedData.totalAmount.toLocaleString()}</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs text-slate-400 font-bold uppercase">Auto-Category</label>
                                        <span className="ml-2 px-2 py-1 bg-[#1B5E20]/10 text-[#1B5E20] rounded text-xs font-bold">
                                            {extractedData.suggestedCategory}
                                        </span>
                                    </div>

                                    <div className="border-t pt-4">
                                        <label className="text-xs text-slate-400 font-bold uppercase mb-2 block">Line Items</label>
                                        {extractedData.lineItems.map((item, idx) => (
                                            <div key={idx} className="flex justify-between text-sm py-1">
                                                <span>{item.description}</span>
                                                <span className="font-medium">${item.amount.toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        onClick={handleCreateBill}
                                        disabled={creating}
                                        className="w-full py-3 bg-[#1B5E20] text-white font-bold rounded-lg hover:bg-[#1B5E20]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {creating ? (
                                            <>
                                                <div className="animate-spin size-4 border-2 border-white border-t-transparent rounded-full"></div>
                                                Creating Bill...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined">send</span>
                                                Create Bill in QuickBooks
                                            </>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-slate-400">
                                    <span className="material-symbols-outlined text-4xl mb-2">receipt_long</span>
                                    <p className="text-sm">Upload an invoice to see extracted data</p>
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
