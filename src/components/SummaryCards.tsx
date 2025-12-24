import React from 'react';
import type { Transaction } from '../context/BudgetContext';
import { DebtsManager } from './DebtsManager';

interface SummaryCardsProps {
    transactions: Transaction[];
    currentMonth: string; // YYYY-MM
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions }) => {

    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    // Include the new 'debt-payment' type in the monthly outgoing "Debt Pmts" sum
    const debt = transactions.filter(t => t.type === 'debt' || t.type === 'debt-payment').reduce((acc, t) => acc + t.amount, 0);

    const profitLoss = income - expense - debt;

    // Standard Monthly Cards
    const cards = [
        { label: 'INCOME', amount: income, color: 'var(--neo-green)' },
        { label: 'EXPENSES', amount: expense, color: 'var(--neo-yellow)' },
        { label: 'DEBT PMTS', amount: debt, color: '#e0c3fc' }, // Light purple for monthly payments
        { label: 'PROFIT/LOSS', amount: profitLoss, color: profitLoss >= 0 ? 'var(--neo-cyan)' : '#ff6b6b' },
    ];

    return (
        <div className="grid-responsive">
            {cards.map((card, idx) => (
                <div key={idx} className="neo-box" style={{ background: card.color, textAlign: 'center', padding: '2rem 1rem' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.9 }}>{card.label}</h4>
                    <div className="amount" style={{ fontSize: '2.5rem' }}>
                        ${card.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
            ))}

            {/* The Total Outstanding Debt Card (Managed via Modal) */}
            <DebtsManager />

            <style>{`
        .grid-responsive {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .amount {
          font-weight: 900;
          letter-spacing: -1px;
        }
      `}</style>
        </div>
    );
};
