const accounts = [
    { name: 'Main Operating - Phoenix', balance: 312450, type: 'Checking' },
    { name: 'Payroll Account', balance: 89200, type: 'Checking' },
    { name: 'Operating - Tucson', balance: 145800, type: 'Checking' },
    { name: 'Tax Reserve', balance: 334353, type: 'Savings' },
    { name: 'Working Capital', balance: 67500, type: 'Checking' },
    { name: 'Cultivation Ops', balance: 28900, type: 'Checking' },
];

const mockBills = [
    { id: 'bill-1', amount: 18500, dueDate: '2026-01-17', status: 'Open' },
    { id: 'bill-2', amount: 9200, dueDate: '2026-01-19', status: 'Open' },
    { id: 'bill-3', amount: 14600, dueDate: '2026-02-02', status: 'Open' },
];

const mockInvoices = [
    { id: 'inv-1', amount: 24100, dueDate: '2026-01-16', status: 'Open' },
    { id: 'inv-2', amount: 12800, dueDate: '2026-01-21', status: 'Open' },
    { id: 'inv-3', amount: 9800, dueDate: '2026-02-05', status: 'Open' },
];

function isWithinNextDays(dateString: string, days: number) {
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() + days);
    const target = new Date(dateString);
    return target >= today && target <= cutoff;
}

function formatCurrency(value: number) {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CashPositionCard() {
    const totalBankBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
    const operatingLiquidity = accounts
        .filter((account) => account.type === 'Checking')
        .reduce((sum, account) => sum + account.balance, 0);
    const taxReserves = accounts
        .filter((account) => account.type === 'Savings')
        .reduce((sum, account) => sum + account.balance, 0);

    const openBillsDueSoon = mockBills
        .filter((bill) => bill.status === 'Open' && isWithinNextDays(bill.dueDate, 7))
        .reduce((sum, bill) => sum + bill.amount, 0);

    const openInvoicesDueSoon = mockInvoices
        .filter((invoice) => invoice.status === 'Open' && isWithinNextDays(invoice.dueDate, 7))
        .reduce((sum, invoice) => sum + invoice.amount, 0);

    const projectedAvailableCash = totalBankBalance - openBillsDueSoon + openInvoicesDueSoon;

    return (
        <div className="bg-[#F8F9FA] border border-[#E9EDF0] rounded-xl p-6 md:col-span-2 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[280px]">
            <div className="absolute top-0 right-0 w-32 h-full bg-[#1B5E20]/5 -skew-x-12 translate-x-16"></div>
            <div>
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Aggregated Cash Position</span>
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-[10px] font-black">+12.4% MoM</span>
                </div>
                <p className="text-5xl font-black text-[#FFB300] tracking-tighter mb-4">${formatCurrency(totalBankBalance)}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-white p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Operating Liquidity</p>
                        <p className="text-lg font-bold text-slate-700">${formatCurrency(operatingLiquidity)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Tax Reserves</p>
                        <p className="text-lg font-bold text-slate-700">${formatCurrency(taxReserves)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Projected Available Cash</p>
                        <p className="text-lg font-bold text-[#1B5E20]">${formatCurrency(projectedAvailableCash)}</p>
                    </div>
                </div>
            </div>
            {/* Mini Bar Chart */}
            <div className="flex items-end gap-1.5 h-16 mt-6">
                <div className="flex-1 bg-slate-200 h-[60%] rounded-t-sm"></div>
                <div className="flex-1 bg-slate-200 h-[45%] rounded-t-sm"></div>
                <div className="flex-1 bg-slate-200 h-[80%] rounded-t-sm"></div>
                <div className="flex-1 bg-slate-200 h-[30%] rounded-t-sm"></div>
                <div className="flex-1 bg-[#1B5E20]/40 h-[90%] rounded-t-sm"></div>
                <div className="flex-1 bg-[#1B5E20]/60 h-[75%] rounded-t-sm"></div>
                <div className="flex-1 bg-[#1B5E20] h-[100%] rounded-t-sm"></div>
            </div>
        </div>
    );
}
