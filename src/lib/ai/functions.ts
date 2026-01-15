// AI Function Definitions for Mary's Financial Assistant
// These are the "tools" the AI can call based on what Mary says

export interface AIFunction {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export const AI_FUNCTIONS: AIFunction[] = [
  // ============ EXPENSE & TRANSACTION RECORDING ============
  {
    name: 'record_expense',
    description: 'Record an expense or payment that Mary made. Use this when she says she paid for something.',
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'The dollar amount of the expense'
        },
        vendor_or_description: {
          type: 'string',
          description: 'Who was paid or what was it for (e.g., "AC repair", "Verde Farms", "electric bill")'
        },
        category_suggestion: {
          type: 'string',
          enum: ['Repairs & Maintenance', 'Utilities', 'Inventory/COGS', 'Supplies', 'Professional Services', 'Rent', 'Insurance', 'Payroll', 'Marketing', 'Other'],
          description: 'Suggested expense category'
        },
        property_id: {
          type: 'string',
          description: 'If this expense is for a specific property, the property ID. Null if unknown or not property-related.'
        },
        payment_method: {
          type: 'string',
          enum: ['cash', 'check', 'credit_card', 'bank_transfer', 'unknown'],
          description: 'How the payment was made'
        },
        date: {
          type: 'string',
          description: 'Date of the expense (YYYY-MM-DD). Use today if not specified.'
        }
      },
      required: ['amount', 'vendor_or_description']
    }
  },

  // ============ BALANCE & ACCOUNT QUERIES ============
  {
    name: 'get_cash_position',
    description: 'Get current cash balances across all bank accounts or specific accounts',
    parameters: {
      type: 'object',
      properties: {
        account_filter: {
          type: 'string',
          description: 'Optional: filter by account name or type (e.g., "operating", "payroll", "savings")'
        },
        group_by: {
          type: 'string',
          enum: ['none', 'account_type', 'bank', 'business'],
          description: 'How to group the results'
        }
      }
    }
  },

  {
    name: 'get_account_balance',
    description: 'Get the balance of a specific bank account',
    parameters: {
      type: 'object',
      properties: {
        account_name: {
          type: 'string',
          description: 'Name or partial name of the account'
        }
      },
      required: ['account_name']
    }
  },

  // ============ REPORTS & SUMMARIES ============
  {
    name: 'generate_pl_summary',
    description: 'Generate a profit and loss summary. Use when Mary asks about profits, losses, how the business is doing, or P&L.',
    parameters: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'ytd', 'custom'],
          description: 'Time period for the report'
        },
        business_filter: {
          type: 'string',
          description: 'Optional: specific business or entity to filter by'
        },
        detail_level: {
          type: 'string',
          enum: ['summary', 'detailed'],
          description: 'Summary gives totals, detailed breaks down by category'
        }
      },
      required: ['period']
    }
  },

  {
    name: 'get_spending_breakdown',
    description: 'Get breakdown of spending by category, vendor, or time period',
    parameters: {
      type: 'object',
      properties: {
        group_by: {
          type: 'string',
          enum: ['category', 'vendor', 'week', 'month', 'property'],
          description: 'How to break down the spending'
        },
        category_filter: {
          type: 'string',
          description: 'Optional: filter to specific category (e.g., "repairs", "utilities")'
        },
        period: {
          type: 'string',
          enum: ['this_month', 'last_month', 'this_quarter', 'this_year'],
          description: 'Time period'
        }
      },
      required: ['group_by', 'period']
    }
  },

  // ============ DOCUMENT SEARCH ============
  {
    name: 'search_documents',
    description: 'Search through all documents in Google Drive using natural language',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for (e.g., "Phoenix lease agreement", "Verde Farms invoices")'
        },
        file_type_filter: {
          type: 'string',
          enum: ['all', 'pdf', 'word', 'spreadsheet', 'image'],
          description: 'Optional filter by file type'
        }
      },
      required: ['query']
    }
  },

  // ============ INVOICE & BILL MANAGEMENT ============
  {
    name: 'create_bill',
    description: 'Create a bill (accounts payable) in QuickBooks',
    parameters: {
      type: 'object',
      properties: {
        vendor_name: {
          type: 'string',
          description: 'Name of the vendor'
        },
        amount: {
          type: 'number',
          description: 'Total amount of the bill'
        },
        due_date: {
          type: 'string',
          description: 'Due date (YYYY-MM-DD)'
        },
        description: {
          type: 'string',
          description: 'Description or memo for the bill'
        },
        category: {
          type: 'string',
          description: 'Expense category'
        }
      },
      required: ['vendor_name', 'amount']
    }
  },

  {
    name: 'create_invoice',
    description: 'Create an invoice (accounts receivable) to bill a customer',
    parameters: {
      type: 'object',
      properties: {
        customer_name: {
          type: 'string',
          description: 'Name of the customer to invoice'
        },
        amount: {
          type: 'number',
          description: 'Invoice amount'
        },
        description: {
          type: 'string',
          description: 'Description of goods/services'
        },
        due_date: {
          type: 'string',
          description: 'Payment due date (YYYY-MM-DD)'
        }
      },
      required: ['customer_name', 'amount', 'description']
    }
  },

  {
    name: 'get_outstanding_invoices',
    description: 'Get list of unpaid invoices (money owed to Mary)',
    parameters: {
      type: 'object',
      properties: {
        customer_filter: {
          type: 'string',
          description: 'Optional: filter by customer name'
        },
        days_overdue: {
          type: 'number',
          description: 'Optional: only show invoices overdue by this many days'
        }
      }
    }
  },

  {
    name: 'get_outstanding_bills',
    description: 'Get list of unpaid bills (money Mary owes)',
    parameters: {
      type: 'object',
      properties: {
        vendor_filter: {
          type: 'string',
          description: 'Optional: filter by vendor name'
        },
        due_within_days: {
          type: 'number',
          description: 'Optional: only show bills due within this many days'
        }
      }
    }
  },

  // ============ PROPERTY MANAGEMENT ============
  {
    name: 'get_properties',
    description: 'Get list of properties Mary owns/manages',
    parameters: {
      type: 'object',
      properties: {
        include_tenants: {
          type: 'boolean',
          description: 'Whether to include tenant information'
        }
      }
    }
  },

  {
    name: 'get_property_expenses',
    description: 'Get expenses for a specific property',
    parameters: {
      type: 'object',
      properties: {
        property_id: {
          type: 'string',
          description: 'Property identifier'
        },
        period: {
          type: 'string',
          enum: ['this_month', 'last_month', 'this_year'],
          description: 'Time period'
        }
      },
      required: ['property_id']
    }
  },

  // ============ CANNABIS BUSINESS ============
  {
    name: 'get_dispensary_sales',
    description: 'Get sales data from dispensaries',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Optional: specific location (e.g., "Phoenix", "Tempe")'
        },
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month'],
          description: 'Time period for sales data'
        }
      },
      required: ['period']
    }
  },

  {
    name: 'get_inventory_status',
    description: 'Get current cannabis inventory levels',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'Optional: specific location'
        },
        product_type: {
          type: 'string',
          enum: ['all', 'flower', 'concentrate', 'edibles', 'prerolls'],
          description: 'Type of product'
        },
        low_stock_only: {
          type: 'boolean',
          description: 'Only show items that are low in stock'
        }
      }
    }
  },

  // ============ ALERTS & REMINDERS ============
  {
    name: 'get_alerts',
    description: 'Get current alerts and items needing attention',
    parameters: {
      type: 'object',
      properties: {
        alert_type: {
          type: 'string',
          enum: ['all', 'low_balance', 'overdue_bills', 'overdue_invoices', 'compliance', 'inventory'],
          description: 'Type of alerts to retrieve'
        }
      }
    }
  }
];

// Functions that require user confirmation before execution
export const WRITE_OPERATIONS = [
  'record_expense',
  'create_bill',
  'create_invoice',
  'initiate_payment',
  'transfer_funds'
];

// Keywords that suggest property-related expenses
export const PROPERTY_KEYWORDS = [
  'repair', 'maintenance', 'ac', 'hvac', 'plumbing', 'roof', 
  'tenant', 'rent', 'property', 'lawn', 'pest', 'appliance'
];
