import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import type { TransactionType } from '../context/BudgetContext';
import { ArrowRight } from 'lucide-react';

const CATEGORIES = [
    "Rent & Utilities",
    "Food/Beverages/Groceries",
    "Transportation/Gas",
    "Personal Subscription",
    "Business Subscription",
    "Personal Purchase",
    "Business Purchase",
    "Entertainment/Fun",
    "Interest / Fees",
    "Health",
    "Travel",
    "Loan Payments",
    "Donation",
    "Coffee Shops",
    "Other"
];

export const AddTransactionForm: React.FC = () => {
    const { addTransaction, debts } = useBudget();
    const [desc, setDesc] = useState('');
    const [amount, setAmount] = useState('');
    const [type, setType] = useState<TransactionType | 'debt'>('expense');
    const [category, setCategory] = useState(CATEGORIES[0]);
    const [selectedDebtId, setSelectedDebtId] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!desc || !amount) return;

        addTransaction({
            description: desc,
            amount: parseFloat(amount),
            type: type as TransactionType,
            category: category || 'Uncategorized',
            date: new Date().toISOString().split('T')[0],
            debtAccountId: selectedDebtId || undefined
        });
        setDesc('');
        setAmount('');
        // No reset for category
    };

    // Type selection logic
    // If user selects "DEBT PAYMENT", show Debt selector.
    // If user selects "DEBT INTEREST", show Debt selector.
    const isDebtRelated = type === 'debt' || type === 'debt-payment' || type === 'debt-interest';

    return (
        <div className="neo-box">
            <h3 style={{ borderBottom: '4px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>Add New Entry</h3>
            <form onSubmit={handleSubmit} className="form-stack">
                <div className="form-group">
                    <label>DESCRIPTION</label>
                    <input
                        className="neo-input"
                        placeholder="e.g. Tacos (yummy)"
                        value={desc}
                        onChange={e => setDesc(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label>AMOUNT</label>
                    <input
                        className="neo-input"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label>TYPE</label>
                    <select
                        className="neo-input"
                        value={type}
                        onChange={e => setType(e.target.value as TransactionType)}
                        style={{ cursor: 'pointer', appearance: 'none' }}
                    >
                        <option value="expense">EXPENSE</option>
                        <option value="income">INCOME</option>
                        <option value="debt-payment">DEBT PAYMENT (Reduces Debt)</option>
                        <option value="debt-interest">DEBT INTEREST (Increases Debt)</option>
                    </select>
                </div>

                {isDebtRelated && (
                    <div className="form-group">
                        <label>LINK TO DEBT ACCOUNT</label>
                        <select
                            className="neo-input"
                            style={{ border: '4px solid var(--neo-pink)' }}
                            value={selectedDebtId}
                            onChange={e => setSelectedDebtId(e.target.value)}
                        >
                            <option value="">-- No Account / One-off --</option>
                            {debts.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="form-group">
                    <label>CATEGORY</label>
                    <div style={{ position: 'relative' }}>
                        <select
                            className="neo-input"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            style={{ cursor: 'pointer', appearance: 'none' }}
                        >
                            {CATEGORIES.map(c => (
                                <option key={c} value={c}>{c.toUpperCase()}</option>
                            ))}
                            <option value="Uncategorized">UNCATEGORIZED</option>
                        </select>
                        <div style={{
                            position: 'absolute',
                            right: '1rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                            fontWeight: 'bold'
                        }}>▼</div>
                    </div>
                </div>

                <button type="submit" className="neo-btn yellow" style={{ justifyContent: 'center', width: '100%', marginTop: '1rem' }}>
                    ADD ENTRY <ArrowRight size={20} strokeWidth={3} />
                </button>
            </form>
            <style>{`
        .form-stack {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-group label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 900;
            font-size: 0.9rem;
        }
      `}</style>
        </div>
    );
};
