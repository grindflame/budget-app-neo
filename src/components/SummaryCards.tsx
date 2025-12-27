import React, { useMemo } from 'react';
import type { Transaction } from '../context/BudgetContext';
import { useBudget } from '../context/BudgetContext';
import { DebtsManager } from './DebtsManager';
import { AssetsManager } from './AssetsManager';
import { RecurringManager } from './RecurringManager';

interface SummaryCardsProps {
    transactions: Transaction[];
    currentMonth: string; // YYYY-MM
    viewMode?: 'month' | 'year';
    currentYear?: string; // YYYY
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ transactions, currentMonth, viewMode = 'month', currentYear }) => {
    const { categoryBudgets } = useBudget();

    const periodKey = viewMode === 'year' ? (currentYear || currentMonth.slice(0, 4)) : currentMonth;
    const tx = useMemo(() => {
        return transactions.filter(t => t.date.startsWith(periodKey));
    }, [transactions, periodKey]);

    const cashflow = useMemo(() => {
    const isTransferDesc = (desc: string) => {
      const d = (desc || '').toLowerCase();
      return d.includes('transfer to') || d.includes('transfer from') || d.includes('trf to') || d.includes('trf fr') || d.includes('overdraft transfer');
    };

        const income = tx.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);

    // Budget spend: cash expenses + credit card charges + debt interest
    const spend = tx
      .filter(t => (t.type === 'expense' && !isTransferDesc(t.description)) || (t.type as string) === 'debt-charge' || t.type === 'debt-interest')
      .reduce((acc, t) => acc + t.amount, 0);

        // Debt Payments (Outflow)
        const debtPayments = tx
            .filter(t => t.type === 'debt' || t.type === 'debt-payment')
            .reduce((acc, t) => acc + t.amount, 0);

    // If a debt account has charges in-period, treat its payments as transfers (avoid double-counting against spend).
    const chargedDebtIds = new Set(
      tx.filter(t => (t.type as string) === 'debt-charge' || t.type === 'debt-interest')
        .map(t => t.debtAccountId)
        .filter((x): x is string => Boolean(x))
    );
    const debtPaymentsLoanOnly = tx
      .filter(t => (t.type === 'debt' || t.type === 'debt-payment') && (!t.debtAccountId || !chargedDebtIds.has(t.debtAccountId)))
      .reduce((acc, t) => acc + t.amount, 0);

        // Savings / Asset Deposits (Outflow from Cash, Inflow to Net Worth)
        const savings = tx
            .filter(t => t.type === 'asset-deposit')
            .reduce((acc, t) => acc + t.amount, 0);

    // "Cash Left" = Income - (Budget Spend + Savings Transfers + Loan-only debt payments)
    // Credit-card payments are not treated as spend if the underlying charges are already counted.
    const cashLeft = income - (spend + savings + debtPaymentsLoanOnly);

        // Rates (avoid division by 0)
        const savingsRate = income > 0 ? savings / income : 0;
        const debtPayoffRate = income > 0 ? debtPayments / income : 0;

    return { income, spend, debtPayments, savings, cashLeft, savingsRate, debtPayoffRate };
    }, [tx]);

    const budgetHealth = useMemo(() => {
        // Only compare "expense" types to category budgets (keeps it intuitive)
        const spendByCategory: Record<string, number> = {};
        tx
            .filter(t => (t.type === 'expense' && !((t.description || '').toLowerCase().includes('transfer'))) || (t.type as string) === 'debt-charge' || t.type === 'debt-interest')
            .forEach(t => {
                spendByCategory[t.category] = (spendByCategory[t.category] || 0) + t.amount;
            });

        const overspent = Object.entries(spendByCategory)
            .map(([category, actual]) => {
                const budgetMultiplier = viewMode === 'year' ? 12 : 1;
                const budget = (categoryBudgets[category] ?? 0) * budgetMultiplier;
                const overBy = budget > 0 ? actual - budget : 0;
                return { category, actual, budget, overBy };
            })
            .filter(x => x.overBy > 0)
            .sort((a, b) => b.overBy - a.overBy)
            .slice(0, 3);

        return { overspent };
    }, [tx, categoryBudgets, viewMode]);

    // Standard Monthly Cards
    const cards = [
        { label: 'INCOME', amount: cashflow.income, color: 'var(--neo-green)' },
    { label: 'SPEND', amount: cashflow.spend, color: 'var(--neo-yellow)' },
        { label: 'DEBT PMTS', amount: cashflow.debtPayments, color: '#e0c3fc' }, // Light purple
        { label: 'SAVINGS', amount: cashflow.savings, color: '#9bf6ff' }, // Light cyan
        { label: 'CASH LEFT', amount: cashflow.cashLeft, color: cashflow.cashLeft >= 0 ? 'white' : '#ff6b6b' },
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
                        {card.label === 'CASH LEFT' && cashflow.cashLeft < 0 && (
                            <div style={{ marginTop: '0.5rem', fontWeight: 900, fontSize: '0.8rem' }}>
                                OVERSPENT BY ${Math.abs(cashflow.cashLeft).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Budget Health */}
            <div className="neo-box" style={{ background: 'white' }}>
                <h3 style={{ marginBottom: '1rem', borderBottom: '4px solid black', paddingBottom: '0.5rem' }}>
                    BUDGET HEALTH ({viewMode === 'year' ? 'THIS YEAR' : 'THIS MONTH'})
                </h3>

                <div className="health-grid">
                    <div className="health-stat">
                        <div className="health-label">SAVINGS RATE</div>
                        <div className="health-value">
                            {(cashflow.savingsRate * 100).toFixed(1)}%
                        </div>
                    </div>
                    <div className="health-stat">
                        <div className="health-label">DEBT PAYOFF RATE</div>
                        <div className="health-value">
                            {(cashflow.debtPayoffRate * 100).toFixed(1)}%
                        </div>
                    </div>
                    <div className="health-stat" style={{ borderColor: cashflow.cashLeft >= 0 ? 'black' : 'red' }}>
                        <div className="health-label">STATUS</div>
                        <div className="health-value" style={{ color: cashflow.cashLeft >= 0 ? 'black' : 'red' }}>
                            {cashflow.cashLeft >= 0 ? 'ON TRACK' : 'OVERSPENT'}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '1.25rem' }}>
                    <div style={{ fontWeight: 900, marginBottom: '0.5rem' }}>TOP OVERSPENT CATEGORIES</div>
                    {budgetHealth.overspent.length === 0 ? (
                        <div style={{ opacity: 0.7, fontWeight: 700 }}>No overspent categories with targets set.</div>
                    ) : (
                        <div className="overspent-list">
                            {budgetHealth.overspent.map((o) => (
                                <div key={o.category} className="overspent-row">
                                    <div style={{ fontWeight: 900 }}>{o.category}</div>
                                    <div style={{ textAlign: 'right', fontWeight: 900 }}>
                                        +${o.overBy.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        <span style={{ fontWeight: 700, opacity: 0.7 }}>
                                            {' '}({o.actual.toFixed(0)} / {o.budget.toFixed(0)})
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="managers-grid">
                {/* The Total Outstanding Debt Card (Managed via Modal) */}
                <DebtsManager />
                {/* The Total Assets Card (Managed via Modal) */}
                <AssetsManager />
                {/* Recurring Rules */}
                <RecurringManager currentMonth={currentMonth} />
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
        .health-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
        }
        .health-stat {
          border: 3px solid black;
          box-shadow: 4px 4px 0 black;
          padding: 1rem;
          background: #f9f9f9;
        }
        .health-label {
          font-weight: 900;
          font-size: 0.8rem;
          opacity: 0.8;
          margin-bottom: 0.25rem;
        }
        .health-value {
          font-weight: 900;
          font-size: 1.6rem;
          letter-spacing: -1px;
        }
        .overspent-list {
          display: grid;
          gap: 0.5rem;
        }
        .overspent-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 0.75rem;
          border: 2px solid black;
          box-shadow: 2px 2px 0 black;
          padding: 0.75rem;
          background: #fff;
        }
        .amount {
          font-weight: 900;
          letter-spacing: -1px;
        }
      `}</style>
        </div>
    );
};
