import React from 'react';
import type { Transaction } from '../context/BudgetContext';
import { DebtsManager } from './DebtsManager';
import { AssetsManager } from './AssetsManager';

interface SummaryCardsProps {
    transactions: Transaction[];
    currentMonth: string; // YYYY-MM
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions }) => {

    // CASHFLOW LOGIC
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);

    // Expenses (Standard)
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);

    // Debt Payments (Outflow)
    const debt = transactions.filter(t => t.type === 'debt' || t.type === 'debt-payment').reduce((acc, t) => acc + t.amount, 0);

    // Savings / Asset Deposits (Outflow from Cash, Inflow to Net Worth)
    const savings = transactions.filter(t => t.type === 'asset-deposit').reduce((acc, t) => acc + t.amount, 0);

    // Profit/Loss = Income - (Expenses + Debt + Savings)
    // This represents "Unallocated Cash" remaining.
    const unallocated = income - (expense + debt + savings);

    // Standard Monthly Cards
    const cards = [
        { label: 'INCOME', amount: income, color: 'var(--neo-green)' },
        { label: 'EXPENSES', amount: expense, color: 'var(--neo-yellow)' },
        { label: 'DEBT PMTS', amount: debt, color: '#e0c3fc' }, // Liht purple
        { label: 'SAVINGS', amount: savings, color: '#9bf6ff' }, // Light cyan
        { label: 'REMAINING', amount: unallocated, color: unallocated >= 0 ? 'white' : '#ff6b6b' },
    ];

    return (
        <div className="summary-section">
            <div className="grid-responsive">
                {cards.map((card, idx) => (
                    <div key={idx} className="neo-box" style={{ background: card.color, textAlign: 'center', padding: '1.5rem 1rem' }}>
                        <h4 style={{ fontSize: '0.8rem', marginBottom: '0.5rem', opacity: 0.9, fontWeight: 900 }}>{card.label}</h4>
                        <div className="amount" style={{ fontSize: '2rem' }}>
                            ${card.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="managers-grid">
                {/* The Total Outstanding Debt Card (Managed via Modal) */}
                <DebtsManager />
                {/* The Total Assets Card (Managed via Modal) */}
                <AssetsManager />
            </div>

            <style>{`
        .summary-section {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            margin-bottom: 2rem;
        }
        .grid-responsive {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }
        .managers-grid {
             display: grid;
             grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
             gap: 1.5rem;
        }
        .amount {
          font-weight: 900;
          letter-spacing: -1px;
        }
      `}</style>
        </div>
    );
};
