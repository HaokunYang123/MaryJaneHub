import { NextRequest, NextResponse } from 'next/server';
import { createJournalEntry, isAuthenticated } from '@/lib/quickbooks';

export async function POST(request: NextRequest) {
    if (!isAuthenticated()) {
        return NextResponse.json({ error: 'Not authenticated with QuickBooks' }, { status: 401 });
    }

    try {
        const data = await request.json();
        console.log('[quickbooks/journal-entry/transfer] Payload received', data);

        const sourceEntity = data.sourceEntityId || data.sourceEntity;
        const destinationEntity = data.destinationEntityId || data.destinationEntity;
        const { amount, date } = data;

        if (!sourceEntity || !destinationEntity || !amount) {
            return NextResponse.json({ error: 'sourceEntity, destinationEntity, and amount are required' }, { status: 400 });
        }

        const transferDate = date || new Date().toISOString().split('T')[0];
        const transferAmount = Number(amount);

        if (!transferAmount || transferAmount <= 0) {
            return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
        }

        const accountRefs = {
            intercompanyPayables: { value: '300', name: 'Inter-company Payables' },
            intercompanyReceivables: { value: '400', name: 'Inter-company Receivables' },
            bankAccount: { value: '500', name: 'Bank Account' },
        };

        console.log('[quickbooks/journal-entry/transfer] Creating source entity entry');
        const sourceEntryPayload = {
            TxnDate: transferDate,
            Line: [
                {
                    Amount: transferAmount,
                    DetailType: 'JournalEntryLineDetail',
                    JournalEntryLineDetail: {
                        PostingType: 'Debit',
                        AccountRef: accountRefs.intercompanyPayables,
                    },
                },
                {
                    Amount: transferAmount,
                    DetailType: 'JournalEntryLineDetail',
                    JournalEntryLineDetail: {
                        PostingType: 'Credit',
                        AccountRef: accountRefs.bankAccount,
                    },
                },
            ],
        };

        console.log('[quickbooks/journal-entry/transfer] Creating destination entity entry');
        const destinationEntryPayload = {
            TxnDate: transferDate,
            Line: [
                {
                    Amount: transferAmount,
                    DetailType: 'JournalEntryLineDetail',
                    JournalEntryLineDetail: {
                        PostingType: 'Debit',
                        AccountRef: accountRefs.bankAccount,
                    },
                },
                {
                    Amount: transferAmount,
                    DetailType: 'JournalEntryLineDetail',
                    JournalEntryLineDetail: {
                        PostingType: 'Credit',
                        AccountRef: accountRefs.intercompanyReceivables,
                    },
                },
            ],
        };

        const sourceEntry = await createJournalEntry(sourceEntryPayload, sourceEntity);
        const destinationEntry = await createJournalEntry(destinationEntryPayload, destinationEntity);

        console.log('[quickbooks/journal-entry/transfer] Transfer completed', {
            sourceEntryId: sourceEntry?.Id,
            destinationEntryId: destinationEntry?.Id,
        });

        return NextResponse.json({
            success: true,
            sourceEntry,
            destinationEntry,
        });
    } catch (error) {
        console.error('Error creating transfer journal entries:', error);
        return NextResponse.json({ error: 'Failed to create transfer journal entries' }, { status: 500 });
    }
}
