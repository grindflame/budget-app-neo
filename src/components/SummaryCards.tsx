import React from 'react';
import type { Transaction } from '../context/BudgetContext';
import { ArrowUpCircle, ArrowDownCircle, AlertCircle, DollarSign } from 'lucide-react';

interface SummaryCardsProps {
    transactions: Transaction[];
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions }) => {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const debt = transactions.filter(t => t.type === 'debt').reduce((acc, t) => acc + t.amount, 0);
    const total = income - expense - debt;

    return (
        <div className="grid-responsive">
            <div className="neo-box" style={{ background: 'var(--neo-green)' }}>
                <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                    <h3>Income</h3>
                    <ArrowUpCircle size={32} />
                </div>
                <div className="amount">${income.toFixed(2)}</div>
            </div>

            <div className="neo-box" style={{ background: '#FFADAD' }}>
                <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                    <h3>Expenses</h3>
                    <ArrowDownCircle size={32} />
                </div>
                <div className="amount">${expense.toFixed(2)}</div>
            </div>

            <div className="neo-box" style={{ background: '#FFD6A5' }}>
                <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                    <h3>Debt Paid</h3>
                    <AlertCircle size={32} />
                </div>
                <div className="amount">${debt.toFixed(2)}</div>
            </div>

            <div className="neo-box" style={{ background: total >= 0 ? 'var(--neo-yellow)' : 'var(--neo-pink)' }}>
                <div className="flex-center" style={{ justifyContent: 'space-between' }}>
                    <h3>Net Flow</h3>
                    <DollarSign size={32} />
                </div>
                <div className="amount">${total.toFixed(2)}</div>
            </div>

            <style>{`
        .grid-responsive {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .amount {
          font-size: 2.5rem;
          font-weight: 900;
          margin-top: 1rem;
        }
      `}</style>
        </div>
    );
};
