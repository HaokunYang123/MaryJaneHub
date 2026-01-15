// Function Executor - Connects AI function calls to real APIs
// For demo purposes, returns realistic mock data where APIs aren't connected

interface Property {
  id: string;
  name: string;
  address: string;
  tenant?: string | null;
  monthlyRent?: number;
}

interface BankAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  bank: string;
  lowThreshold: number;
}

interface Expense {
  id: string;
  date: string;
  amount: number;
  vendor: string;
  category: string;
  property?: string;
}

// Mock data for realistic demo
const MOCK_PROPERTIES: Property[] = [
  { id: 'prop_phoenix', name: 'Phoenix Property', address: '1234 W Camelback Rd, Phoenix, AZ', tenant: 'Desert Sun LLC', monthlyRent: 4500 },
  { id: 'prop_tempe', name: 'Tempe Property', address: '456 Mill Ave, Tempe, AZ', tenant: 'College Town Retail', monthlyRent: 3800 },
  { id: 'prop_mesa', name: 'Mesa Property', address: '789 Main St, Mesa, AZ', tenant: 'Mesa Medical Group', monthlyRent: 5200 },
  { id: 'prop_scottsdale', name: 'Scottsdale Property', address: '321 Scottsdale Rd, Scottsdale, AZ', tenant: null, monthlyRent: 6000 },
];

const MOCK_ACCOUNTS: BankAccount[] = [
  { id: 'acc_1', name: 'Operating Account - Main', type: 'checking', balance: 847234.56, bank: 'Chase', lowThreshold: 50000 },
  { id: 'acc_2', name: 'Payroll Account', type: 'checking', balance: 156789.00, bank: 'Chase', lowThreshold: 100000 },
  { id: 'acc_3', name: 'Tax Reserve', type: 'savings', balance: 234567.89, bank: 'Wells Fargo', lowThreshold: 100000 },
  { id: 'acc_4', name: 'Phoenix Dispensary', type: 'checking', balance: 89456.23, bank: 'Local Credit Union', lowThreshold: 25000 },
  { id: 'acc_5', name: 'Tempe Dispensary', type: 'checking', balance: 67234.11, bank: 'Local Credit Union', lowThreshold: 25000 },
  { id: 'acc_6', name: 'Mesa Operations', type: 'checking', balance: 45678.90, bank: 'Bank of America', lowThreshold: 20000 },
  { id: 'acc_7', name: 'Property Management', type: 'checking', balance: 123456.78, bank: 'Wells Fargo', lowThreshold: 30000 },
  { id: 'acc_8', name: 'Emergency Reserve', type: 'savings', balance: 500000.00, bank: 'Chase', lowThreshold: 250000 },
];

const MOCK_EXPENSES: Expense[] = [
  { id: 'exp_1', date: '2024-03-01', amount: 400, vendor: 'AC Repair Pro', category: 'Repairs & Maintenance', property: 'Phoenix Property' },
  { id: 'exp_2', date: '2024-03-03', amount: 340, vendor: 'Tempe Plumbing', category: 'Repairs & Maintenance', property: 'Tempe Property' },
  { id: 'exp_3', date: '2024-03-05', amount: 500, vendor: 'Arizona Roofing', category: 'Repairs & Maintenance', property: 'Mesa Property' },
  { id: 'exp_4', date: '2024-03-07', amount: 2500, vendor: 'Verde Farms', category: 'Inventory/COGS' },
  { id: 'exp_5', date: '2024-03-08', amount: 890, vendor: 'APS Electric', category: 'Utilities' },
  { id: 'exp_6', date: '2024-03-10', amount: 1200, vendor: 'Security Solutions', category: 'Professional Services' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeFunction(functionName: string, args: Record<string, any>): Promise<any> {
  // Simulate API latency
  await new Promise(resolve => setTimeout(resolve, 300));

  switch (functionName) {
    // ===== EXPENSE RECORDING =====
    case 'record_expense': {
      const newExpense: Expense = {
        id: `exp_${Date.now()}`,
        date: args.date || new Date().toISOString().split('T')[0],
        amount: args.amount,
        vendor: args.vendor_or_description,
        category: args.category_suggestion || 'Other',
        property: args.property_id ? MOCK_PROPERTIES.find(p => p.id === args.property_id)?.name : undefined
      };
      MOCK_EXPENSES.push(newExpense);
      
      // Calculate category totals
      const categoryTotal = MOCK_EXPENSES
        .filter(e => e.category === newExpense.category)
        .reduce((sum, e) => sum + e.amount, 0);

      return {
        success: true,
        expense: newExpense,
        categoryTotal,
        message: `Recorded $${args.amount} expense for ${args.vendor_or_description}`
      };
    }

    // ===== BALANCE QUERIES =====
    case 'get_cash_position': {
      let accounts = [...MOCK_ACCOUNTS];
      
      if (args.account_filter) {
        const filter = args.account_filter.toLowerCase();
        accounts = accounts.filter(a => 
          a.name.toLowerCase().includes(filter) || 
          a.type.toLowerCase().includes(filter)
        );
      }

      const total = accounts.reduce((sum, a) => sum + a.balance, 0);

      if (args.group_by === 'account_type') {
        const grouped: Record<string, { total: number; accounts: BankAccount[] }> = {};
        accounts.forEach(a => {
          if (!grouped[a.type]) grouped[a.type] = { total: 0, accounts: [] };
          grouped[a.type].total += a.balance;
          grouped[a.type].accounts.push(a);
        });
        return { total, grouped };
      }

      return { total, accounts };
    }

    case 'get_account_balance': {
      const account = MOCK_ACCOUNTS.find(a => 
        a.name.toLowerCase().includes(args.account_name.toLowerCase())
      );
      if (!account) {
        return { error: 'Account not found', searchTerm: args.account_name };
      }
      return account;
    }

    // ===== REPORTS =====
    case 'generate_pl_summary': {
      // Mock P&L data
      const plData = {
        period: args.period,
        revenue: {
          dispensarySales: 95000,
          rentalIncome: 32000,
          otherIncome: 5000,
          total: 132000
        },
        expenses: {
          costOfGoodsSold: 38000,
          payroll: 28000,
          rent: 12000,
          utilities: 4500,
          repairs: 3200,
          insurance: 2800,
          marketing: 1500,
          professional: 2000,
          other: 2000,
          total: 94000
        },
        netProfit: 38000,
        profitMargin: 28.8
      };

      if (args.detail_level === 'detailed') {
        return plData;
      }
      
      return {
        period: args.period,
        totalRevenue: plData.revenue.total,
        totalExpenses: plData.expenses.total,
        netProfit: plData.netProfit,
        profitMargin: plData.profitMargin
      };
    }

    case 'get_spending_breakdown': {
      const expenses = MOCK_EXPENSES.filter(e => {
        if (args.category_filter) {
          return e.category.toLowerCase().includes(args.category_filter.toLowerCase());
        }
        return true;
      });

      if (args.group_by === 'category') {
        const grouped: Record<string, { total: number; count: number; expenses: Expense[] }> = {};
        expenses.forEach(e => {
          if (!grouped[e.category]) grouped[e.category] = { total: 0, count: 0, expenses: [] };
          grouped[e.category].total += e.amount;
          grouped[e.category].count++;
          grouped[e.category].expenses.push(e);
        });
        return { period: args.period, breakdown: grouped };
      }

      if (args.group_by === 'vendor') {
        const grouped: Record<string, { total: number; count: number }> = {};
        expenses.forEach(e => {
          if (!grouped[e.vendor]) grouped[e.vendor] = { total: 0, count: 0 };
          grouped[e.vendor].total += e.amount;
          grouped[e.vendor].count++;
        });
        return { period: args.period, breakdown: grouped };
      }

      return { period: args.period, expenses };
    }

    // ===== DOCUMENTS =====
    case 'search_documents': {
      // Mock document search results
      const mockDocs = [
        { name: 'Phoenix Property Lease Agreement.pdf', type: 'pdf', lastModified: '2024-01-15', relevance: 0.95 },
        { name: 'Verde Farms Invoice - March 2024.pdf', type: 'pdf', lastModified: '2024-03-07', relevance: 0.88 },
        { name: 'Insurance Policy - All Properties.pdf', type: 'pdf', lastModified: '2024-02-01', relevance: 0.82 },
        { name: 'Mesa Lease Renewal 2024.docx', type: 'word', lastModified: '2024-02-20', relevance: 0.79 },
      ];

      const results = mockDocs.filter(d => {
        const query = args.query.toLowerCase();
        return d.name.toLowerCase().includes(query) || 
               query.split(' ').some((w: string) => d.name.toLowerCase().includes(w));
      });

      return {
        query: args.query,
        resultCount: results.length,
        results: results.slice(0, 5)
      };
    }

    // ===== BILLS & INVOICES =====
    case 'create_bill': {
      return {
        success: true,
        billId: `bill_${Date.now()}`,
        vendor: args.vendor_name,
        amount: args.amount,
        dueDate: args.due_date || 'Net 30',
        message: `Created bill for $${args.amount} from ${args.vendor_name}`
      };
    }

    case 'create_invoice': {
      return {
        success: true,
        invoiceId: `inv_${Date.now()}`,
        customer: args.customer_name,
        amount: args.amount,
        description: args.description,
        message: `Created invoice for $${args.amount} to ${args.customer_name}`
      };
    }

    case 'get_outstanding_invoices': {
      const invoices = [
        { id: 'inv_001', customer: 'Desert Sun Wellness', amount: 5000, dueDate: '2024-03-15', daysOverdue: 0 },
        { id: 'inv_002', customer: 'Phoenix Medical', amount: 3200, dueDate: '2024-03-01', daysOverdue: 14 },
        { id: 'inv_003', customer: 'Tempe Therapeutics', amount: 2800, dueDate: '2024-03-20', daysOverdue: -5 },
      ];

      let filtered = invoices;
      if (args.customer_filter) {
        filtered = filtered.filter(i => i.customer.toLowerCase().includes(args.customer_filter.toLowerCase()));
      }
      if (args.days_overdue) {
        filtered = filtered.filter(i => i.daysOverdue >= args.days_overdue);
      }

      return {
        totalOutstanding: filtered.reduce((sum, i) => sum + i.amount, 0),
        count: filtered.length,
        invoices: filtered
      };
    }

    case 'get_outstanding_bills': {
      const bills = [
        { id: 'bill_001', vendor: 'Verde Farms', amount: 4500, dueDate: '2024-03-20', daysTilDue: 5 },
        { id: 'bill_002', vendor: 'APS Electric', amount: 890, dueDate: '2024-03-25', daysTilDue: 10 },
        { id: 'bill_003', vendor: 'Landlord - Tempe', amount: 3800, dueDate: '2024-04-01', daysTilDue: 17 },
      ];

      let filtered = bills;
      if (args.vendor_filter) {
        filtered = filtered.filter(b => b.vendor.toLowerCase().includes(args.vendor_filter.toLowerCase()));
      }
      if (args.due_within_days !== undefined) {
        filtered = filtered.filter(b => b.daysTilDue <= args.due_within_days);
      }

      return {
        totalOwed: filtered.reduce((sum, b) => sum + b.amount, 0),
        count: filtered.length,
        bills: filtered
      };
    }

    // ===== PROPERTIES =====
    case 'get_properties': {
      const properties = MOCK_PROPERTIES.map(p => ({
        ...p,
        tenant: args.include_tenants ? p.tenant : undefined
      }));
      return { count: properties.length, properties };
    }

    case 'get_property_expenses': {
      const property = MOCK_PROPERTIES.find(p => p.id === args.property_id);
      if (!property) {
        return { error: 'Property not found' };
      }

      const expenses = MOCK_EXPENSES.filter(e => e.property === property.name);
      return {
        property: property.name,
        period: args.period,
        totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
        expenses
      };
    }

    // ===== CANNABIS =====
    case 'get_dispensary_sales': {
      const salesData = {
        today: { revenue: 12450, transactions: 156, avgTicket: 79.81 },
        yesterday: { revenue: 11230, transactions: 142, avgTicket: 79.08 },
        this_week: { revenue: 67890, transactions: 845, avgTicket: 80.34 },
        last_week: { revenue: 65432, transactions: 812, avgTicket: 80.58 },
        this_month: { revenue: 245678, transactions: 3045, avgTicket: 80.68 }
      };

      const period = args.period as keyof typeof salesData;
      const data = salesData[period] || salesData.this_month;

      return {
        period: args.period,
        location: args.location || 'All Locations',
        ...data,
        topProducts: [
          { name: 'Blue Dream 1/8', sales: 2340, units: 89 },
          { name: 'Gorilla Glue Cartridge', sales: 1890, units: 63 },
          { name: 'Gummy Bears 100mg', sales: 1560, units: 78 }
        ]
      };
    }

    case 'get_inventory_status': {
      const inventory = [
        { product: 'Blue Dream', category: 'flower', quantity: 45, unit: 'oz', lowStock: false },
        { product: 'OG Kush', category: 'flower', quantity: 12, unit: 'oz', lowStock: true },
        { product: 'Live Resin Cartridge', category: 'concentrate', quantity: 89, unit: 'units', lowStock: false },
        { product: 'Gummy Bears 100mg', category: 'edibles', quantity: 8, unit: 'packs', lowStock: true },
        { product: 'Pre-Roll 5-Pack', category: 'prerolls', quantity: 67, unit: 'packs', lowStock: false },
      ];

      let filtered = inventory;
      if (args.product_type && args.product_type !== 'all') {
        filtered = filtered.filter(i => i.category === args.product_type);
      }
      if (args.low_stock_only) {
        filtered = filtered.filter(i => i.lowStock);
      }

      return {
        location: args.location || 'All Locations',
        itemCount: filtered.length,
        lowStockCount: filtered.filter(i => i.lowStock).length,
        inventory: filtered
      };
    }

    // ===== ALERTS =====
    case 'get_alerts': {
      const alerts: Array<{ type: string; severity: string; message: string; data?: unknown }> = [];

      // Check low balances
      if (!args.alert_type || args.alert_type === 'all' || args.alert_type === 'low_balance') {
        MOCK_ACCOUNTS.forEach(a => {
          if (a.balance < a.lowThreshold) {
            alerts.push({
              type: 'low_balance',
              severity: 'warning',
              message: `${a.name} is below threshold ($${a.balance.toLocaleString()} / $${a.lowThreshold.toLocaleString()})`,
              data: a
            });
          }
        });
      }

      // Add sample alerts
      if (!args.alert_type || args.alert_type === 'all' || args.alert_type === 'overdue_bills') {
        alerts.push({
          type: 'overdue_bill',
          severity: 'high',
          message: 'Verde Farms bill ($4,500) due in 5 days'
        });
      }

      if (!args.alert_type || args.alert_type === 'all' || args.alert_type === 'inventory') {
        alerts.push({
          type: 'low_inventory',
          severity: 'medium',
          message: 'OG Kush and Gummy Bears running low at Phoenix location'
        });
      }

      return {
        totalAlerts: alerts.length,
        highPriority: alerts.filter(a => a.severity === 'high').length,
        alerts
      };
    }

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}
