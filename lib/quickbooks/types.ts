/**
 * QuickBooks Online API Types
 */

/**
 * QuickBooks reference object (used for VendorRef, AccountRef, etc.)
 */
export interface QBRef {
  value: string;
  name?: string;
}

/**
 * QuickBooks Email Address
 */
export interface QBEmailAddr {
  Address: string;
}

/**
 * QuickBooks Vendor
 */
export interface QBVendor {
  Id: string;
  DisplayName: string;
  PrimaryEmailAddr?: QBEmailAddr;
  Balance: number;
  Active?: boolean;
  CompanyName?: string;
  GivenName?: string;
  FamilyName?: string;
  PrintOnCheckName?: string;
  SyncToken?: string;
}

/**
 * Input for creating a new vendor
 */
export interface QBVendorInput {
  displayName: string;
  email?: string;
  companyName?: string;
}

/**
 * QuickBooks Account-Based Expense Line Detail
 */
export interface QBAccountBasedExpenseLineDetail {
  AccountRef: QBRef;
  BillableStatus?: "Billable" | "NotBillable" | "HasBeenBilled";
  TaxCodeRef?: QBRef;
}

/**
 * QuickBooks Bill Line Item
 */
export interface QBBillLine {
  Amount: number;
  Description?: string;
  DetailType: "AccountBasedExpenseLineDetail" | "ItemBasedExpenseLineDetail";
  AccountBasedExpenseLineDetail?: QBAccountBasedExpenseLineDetail;
  Id?: string;
  LineNum?: number;
}

/**
 * QuickBooks Bill
 */
export interface QBBill {
  Id?: string;
  VendorRef: QBRef;
  TxnDate?: string; // YYYY-MM-DD
  DueDate?: string; // YYYY-MM-DD
  TotalAmt?: number;
  Line: QBBillLine[];
  DocNumber?: string; // Invoice number
  PrivateNote?: string;
  SyncToken?: string;
  Balance?: number;
  CurrencyRef?: QBRef;
}

/**
 * Input for creating a bill
 */
export interface QBBillInput {
  vendorId: string;
  vendorName?: string;
  txnDate?: string;
  dueDate?: string;
  docNumber?: string;
  lines: Array<{
    amount: number;
    description?: string;
    accountId: string;
    accountName?: string;
  }>;
  privateNote?: string;
}

/**
 * QuickBooks Company Info
 */
export interface QBCompanyInfo {
  Id: string;
  CompanyName: string;
  LegalName?: string;
  CompanyAddr?: {
    Line1?: string;
    City?: string;
    CountrySubDivisionCode?: string;
    PostalCode?: string;
    Country?: string;
  };
  Email?: QBEmailAddr;
  SupportedLanguages?: string;
  Country?: string;
  FiscalYearStartMonth?: string;
}

/**
 * QuickBooks API Response wrapper
 */
export interface QBResponse<T> {
  [key: string]: T;
}

/**
 * QuickBooks Query Response
 */
export interface QBQueryResponse<T> {
  QueryResponse: {
    Vendor?: T[];
    Account?: T[];
    Bill?: T[];
    startPosition?: number;
    maxResults?: number;
    totalCount?: number;
  };
}

/**
 * QuickBooks API Error
 */
export interface QBApiError {
  Fault?: {
    Error?: Array<{
      Message: string;
      Detail: string;
      code: string;
    }>;
    type?: string;
  };
}
