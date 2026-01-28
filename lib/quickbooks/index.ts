// Configuration
export { getQBConfig, QB_API_BASE_URL, QB_SCOPES } from "./config";
export type { QBConfig, QBEnvironment } from "./config";

// Authentication
export {
  initOAuthClient,
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshTokens,
  isTokenExpired,
} from "./auth";
export type { QBTokens } from "./auth";

// Token Storage
export {
  saveTokens,
  getTokens,
  deleteTokens,
  isConnected,
} from "./token-store";
export type { QBTokenRecord } from "./token-store";

// API Client
export {
  getCompanyInfo,
  getVendors,
  findVendorByName,
  findVendorByExactName,
  createVendor,
  findOrCreateVendor,
  createBill,
  getBill,
  getExpenseAccounts,
} from "./api";

// Types
export type {
  QBRef,
  QBVendor,
  QBVendorInput,
  QBBill,
  QBBillInput,
  QBBillLine,
  QBCompanyInfo,
  QBAccountBasedExpenseLineDetail,
} from "./types";

// Invoice to Bill Conversion
export {
  convertInvoiceToBill,
  canConvertToBill,
  calculateLineItemsTotal,
} from "./invoice-to-bill";
