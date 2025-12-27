import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import type { Transaction, TransactionType } from '../context/BudgetContext';
import { ArrowRight } from 'lucide-react';
import { NeoSelect } from './NeoSelect';

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
    return <TransactionForm />;
};

export type TransactionDraft = Omit<Transaction, 'id'>;

export type TransactionFormMode = 'add' | 'edit';

export interface TransactionFormProps {
    mode?: TransactionFormMode;
    initial?: Partial<TransactionDraft>;
    onSubmitTransaction?: (t: TransactionDraft) => void;
    onDone?: () => void;
    submitLabel?: string;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
    mode = 'add',
    initial,
    onSubmitTransaction,
    onDone,
    submitLabel,
}) => {
    const { addTransaction, debts, assets } = useBudget();

    const [desc, setDesc] = useState(() => initial?.description ?? '');
    const [amount, setAmount] = useState(() => (
        typeof initial?.amount === 'number' && Number.isFinite(initial.amount)
            ? String(initial.amount)
            : ''
    ));
    const [type, setType] = useState<TransactionType | 'debt'>(() => {
        const normalizedType = initial?.type === 'debt' ? 'debt-payment' : (initial?.type ?? 'expense');
        return normalizedType as TransactionType;
    });
    const [category, setCategory] = useState(() => initial?.category ?? CATEGORIES[0]);
    const [selectedDebtId, setSelectedDebtId] = useState(() => initial?.debtAccountId ?? '');
    const [selectedAssetId, setSelectedAssetId] = useState(() => initial?.assetAccountId ?? '');
    const [txDate, setTxDate] = useState(() => initial?.date ?? new Date().toISOString().split('T')[0]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!desc || !amount) return;

        const draft: TransactionDraft = {
            description: desc,
            amount: parseFloat(amount),
            type: type as TransactionType,
            category: category || 'Uncategorized',
            date: txDate,
            debtAccountId: selectedDebtId || undefined,
            assetAccountId: selectedAssetId || undefined,
            recurringId: initial?.recurringId,
        };

        (onSubmitTransaction || addTransaction)(draft);

        if (mode === 'add') {
            setDesc('');
            setAmount('');
            // Keep category and date
        }
        onDone?.();
    };

    // Type selection logic
    const isDebtRelated = type === 'debt' || type === 'debt-payment' || type === 'debt-interest' || (type as string) === 'debt-charge';
    const isAssetRelated = type === 'asset-deposit' || type === 'asset-growth';

    const title = mode === 'edit' ? 'Edit Entry' : 'Add New Entry';
    const buttonLabel = submitLabel || (mode === 'edit' ? 'SAVE CHANGES' : 'ADD ENTRY');

    return (
        <div className="neo-box">
            <h3 style={{ borderBottom: '4px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>{title}</h3>
            <form onSubmit={handleSubmit} className="form-stack">
                <div className="form-group">
                    <label>DATE</label>
                    <input
                        className="neo-input"
                        type="date"
                        value={txDate}
                        onChange={e => setTxDate(e.target.value)}
                    />
                </div>

                <div className="form-group">
                    <label>DESCRIPTION</label>
                    <input
                        className="neo-input"
                        placeholder="e.g. Tacos (yummy) or 401k Contrib"
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
                    <NeoSelect
                        className="neo-select"
                        value={String(type)}
                        onChange={(v) => {
                            setType(v as TransactionType);
                            setSelectedDebtId('');
                            setSelectedAssetId('');
                        }}
                        options={[
                            { value: 'expense', label: 'Expense' },
                            { value: 'income', label: 'Income' },
                            { value: 'debt-payment', label: 'Debt Payment' },
                            { value: 'debt-interest', label: 'Debt Interest' },
                            { value: 'debt-charge', label: 'Debt Charge (Card Spend)' },
                            { value: 'asset-deposit', label: 'Asset Deposit (Savings)' },
                            { value: 'asset-growth', label: 'Asset Growth (Interest)' },
                        ]}
                    />
                </div>

                {isDebtRelated && (
                    <div className="form-group">
                        <label>LINK TO DEBT ACCOUNT</label>
                        <NeoSelect
                            className="neo-select"
                            style={{ border: '4px solid var(--neo-pink)' }}
                            value={selectedDebtId}
                            onChange={setSelectedDebtId}
                            options={[
                                { value: '', label: '-- No Account / One-off --' },
                                ...debts.map(d => ({ value: d.id, label: d.name })),
                            ]}
                        />
                    </div>
                )}

                {isAssetRelated && (
                    <div className="form-group">
                        <label>LINK TO ASSET ACCOUNT</label>
                        <NeoSelect
                            className="neo-select"
                            style={{ border: '4px solid var(--neo-green)' }}
                            value={selectedAssetId}
                            onChange={setSelectedAssetId}
                            options={[
                                { value: '', label: '-- No Account --' },
                                ...assets.map(a => ({ value: a.id, label: a.name })),
                            ]}
                        />
                    </div>
                )}

                <div className="form-group">
                    <label>CATEGORY</label>
                    <NeoSelect
                        className="neo-select"
                        value={category}
                        onChange={setCategory}
                        options={[
                            ...CATEGORIES.map(c => ({ value: c, label: c })),
                            { value: 'Uncategorized', label: 'Uncategorized' },
                        ]}
                    />
                </div>

                <button type="submit" className="neo-btn yellow" style={{ justifyContent: 'center', width: '100%', marginTop: '1rem' }}>
                    {buttonLabel} <ArrowRight size={20} strokeWidth={3} />
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
