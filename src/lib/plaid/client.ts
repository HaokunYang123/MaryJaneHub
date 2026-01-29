import 'server-only'; // TRAP #3 FIX: Prevents client-side import of API keys

import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

/**
 * Plaid API Client - Server Only
 *
 * This client is configured for transactions-only access (SEC-04).
 * Never import this file in client components.
 */

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);

// SEC-04: Transactions only, NO transfers
export const ALLOWED_PRODUCTS: Products[] = [Products.Transactions];

// Supported countries
export const SUPPORTED_COUNTRIES: CountryCode[] = [CountryCode.Us];

// Plaid Link configuration defaults
export const PLAID_LINK_CONFIG = {
  products: ALLOWED_PRODUCTS,
  countryCodes: SUPPORTED_COUNTRIES,
  language: 'en',
} as const;
