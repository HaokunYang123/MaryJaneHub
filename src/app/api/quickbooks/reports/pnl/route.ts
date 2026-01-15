import { NextRequest, NextResponse } from 'next/server';
import { getProfitAndLossForRealm, getTokens, isAuthenticated } from '@/lib/quickbooks';

function parseNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    const cleaned = value.replace(/[,$]/g, '');
    const isNegative = cleaned.includes('(') && cleaned.includes(')');
    const normalized = cleaned.replace(/[()]/g, '');
    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) return 0;
    return isNegative ? -parsed : parsed;
}

function findSummaryValue(rows: unknown, targetLabel: string): number | null {
    if (!rows) return null;
    const rowArray = Array.isArray(rows) ? rows : [rows];

    for (const row of rowArray) {
        const summary = (row as { Summary?: { ColData?: { value?: string }[] } }).Summary?.ColData;
        const label = summary?.[0]?.value;
        if (label === targetLabel) {
            return parseNumber(summary?.[1]?.value ?? summary?.[0]?.value);
        }

        const nested = findSummaryValue((row as { Rows?: { Row?: unknown } }).Rows?.Row, targetLabel);
        if (nested !== null) {
            return nested;
        }
    }

    return null;
}

function extractReportValue(report: unknown, label: string): number {
    const rows = (report as { Rows?: { Row?: unknown } })?.Rows?.Row;
    return findSummaryValue(rows, label) ?? 0;
}

export async function GET(request: NextRequest) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const searchParams = request.nextUrl.searchParams;
        console.log('[quickbooks/reports/pnl] Incoming request', searchParams.toString());

        // Default to current year if no dates provided
        const today = new Date();
        const startOfYear = new Date(today.getFullYear(), 0, 1);

        const startDate = searchParams.get('start_date') || startOfYear.toISOString().split('T')[0];
        const endDate = searchParams.get('end_date') || today.toISOString().split('T')[0];

        const entityIdsParam = searchParams.get('entityIds') || '';
        const entityIds = entityIdsParam
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean);

        if (entityIds.length === 0) {
            const token = getTokens();
            if (token?.realmId) {
                entityIds.push(token.realmId);
            }
        }

        if (entityIds.length === 0) {
            return NextResponse.json({ error: 'No entityIds provided' }, { status: 400 });
        }

        console.log('[quickbooks/reports/pnl] Fetching P&L for entities', entityIds);

        let totalRevenue = 0;
        let totalNetIncome = 0;
        const breakdown: { entity: string; revenue: number }[] = [];

        for (const realmId of entityIds) {
            try {
                console.log('[quickbooks/reports/pnl] Fetching entity', realmId);
                const report = await getProfitAndLossForRealm(realmId, startDate, endDate);
                const revenue = extractReportValue(report, 'Total Income');
                const netIncome = extractReportValue(report, 'Net Income');

                totalRevenue += revenue;
                totalNetIncome += netIncome;
                breakdown.push({ entity: realmId, revenue });

                console.log('[quickbooks/reports/pnl] Entity totals', {
                    realmId,
                    revenue,
                    netIncome,
                });
            } catch (error) {
                console.error('[quickbooks/reports/pnl] Error fetching entity', realmId, error);
                breakdown.push({ entity: realmId, revenue: 0 });
            }
        }

        const totalExpenses = totalRevenue - totalNetIncome;

        return NextResponse.json({
            totalRevenue,
            totalExpenses,
            breakdown,
            period: { startDate, endDate }
        });
    } catch (error) {
        console.error('Error fetching P&L report:', error);
        return NextResponse.json({ error: 'Failed to fetch P&L report' }, { status: 500 });
    }
}
