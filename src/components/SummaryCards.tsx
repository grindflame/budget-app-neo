import React from 'react';
import type { Transaction } from '../context/BudgetContext';

interface SummaryCardsProps {
    transactions: Transaction[];
    currentMonth: string; // YYYY-MM
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions }) => {
    // Filter for current month is done by parent presumably, but let's trust the prop passed `transactions` is what we want to sum?
    // Wait, Dashboard passes `transactions.filter(...)`. Correct.

    // We also want to show "Budget vs Actual" eventually? 
    // The user requested extra features. Let's add a simple "Safety" metric or similar.
    // Actually, let's keep this clean and just stick to the main request for now, or add a "Budget Health" card.

    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const debt = transactions.filter(t => t.type === 'debt').reduce((acc, t) => acc + t.amount, 0);
    const profitLoss = income - expense - debt;

    const cards = [
        { label: 'INCOME', amount: income, color: 'var(--neo-green)' },
        { label: 'EXPENSES', amount: expense, color: 'var(--neo-yellow)' },
        { label: 'DEBT PMTS', amount: debt, color: 'var(--neo-pink)' },
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
