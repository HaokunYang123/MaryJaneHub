'use client';

import { useState, useCallback } from 'react';
import { usePlaidLink, PlaidLinkOnSuccess, PlaidLinkOptions } from 'react-plaid-link';
import { useRouter } from 'next/navigation';

interface PlaidLinkButtonProps {
  realmId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * PlaidLinkButton Component
 *
 * Handles the full Plaid Link flow:
 * 1. Fetch link_token from backend
 * 2. Open Plaid popup for bank authentication
 * 3. Exchange public_token for access_token via backend
 * 4. Refresh page to show new account
 */
export function PlaidLinkButton({
  realmId,
  onSuccess: onSuccessCallback,
  onError,
  className,
  children,
}: PlaidLinkButtonProps) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch link token when button is clicked
  const fetchLinkToken = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/plaid/create-link-token', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create link token');
      }

      const data = await response.json();
      setLinkToken(data.linkToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize bank connection';
      setError(message);
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle successful Plaid Link completion
  const handleSuccess: PlaidLinkOnSuccess = useCallback(
    async (publicToken, metadata) => {
      setIsLoading(true);
      setError(null);

      try {
        // Exchange public_token for access_token via backend
        const response = await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken,
            realmId, // TRAP #1: Using realmId, not entityId
            institutionName: metadata.institution?.name,
            institutionId: metadata.institution?.institution_id,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to link bank account');
        }

        // Optimistic UI: Refresh to show new account immediately
        router.refresh();
        onSuccessCallback?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to link bank account';
        setError(message);
        onError?.(message);
      } finally {
        setIsLoading(false);
        setLinkToken(null); // Reset for next use
      }
    },
    [realmId, router, onSuccessCallback, onError]
  );

  // Plaid Link configuration
  const config: PlaidLinkOptions = {
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: (err) => {
      if (err) {
        console.error('[PlaidLink] Exit with error:', err);
      }
      setLinkToken(null); // Reset token on exit
    },
  };

  const { open, ready } = usePlaidLink(config);

  // Open Plaid Link when token is ready
  const handleClick = async () => {
    if (linkToken && ready) {
      open();
    } else {
      await fetchLinkToken();
    }
  };

  // Auto-open when linkToken becomes available
  if (linkToken && ready && !isLoading) {
    open();
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={
          className ||
          'flex items-center gap-2 px-4 py-2 bg-[#1B5E20] text-white rounded-lg text-sm font-bold shadow-lg hover:bg-[#2E7D32] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
        }
      >
        {isLoading ? (
          <>
            <span className="material-symbols-outlined text-sm animate-spin">sync</span>
            Connecting...
          </>
        ) : (
          children || (
            <>
              <span className="material-symbols-outlined text-sm">add</span>
              Link Account
            </>
          )
        )}
      </button>
      {error && (
        <p className="text-red-500 text-xs mt-2">{error}</p>
      )}
    </>
  );
}
