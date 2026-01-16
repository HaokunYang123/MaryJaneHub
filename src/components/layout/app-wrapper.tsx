"use client";

import { usePathname } from 'next/navigation';
import { AiSidebar } from './ai-sidebar';

interface AppWrapperProps {
  children: React.ReactNode;
}

// Pages that should NOT show the AI sidebar
const PAGES_WITHOUT_SIDEBAR = ['/ai'];

export function AppWrapper({ children }: AppWrapperProps) {
  const pathname = usePathname();

  // Don't show sidebar on full-screen AI page
  const showSidebar = !PAGES_WITHOUT_SIDEBAR.includes(pathname);

  // Determine context based on current page
  const getPageContext = () => {
    if (pathname.includes('bank')) return 'banking';
    if (pathname.includes('report')) return 'reports';
    if (pathname.includes('file') || pathname.includes('document')) return 'documents';
    if (pathname.includes('inventory')) return 'inventory';
    if (pathname.includes('payroll')) return 'payroll';
    if (pathname.includes('bill') || pathname.includes('payable')) return 'bills';
    if (pathname.includes('receivable') || pathname.includes('tenant')) return 'receivables';
    return 'dashboard';
  };

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
      <AiSidebar pageContext={getPageContext()} />
    </div>
  );
}
