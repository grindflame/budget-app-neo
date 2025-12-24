import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import type { TransactionType } from '../context/BudgetContext';
import { ArrowRight } from 'lucide-react';

export const AddTransactionForm: React.FC = () => {
    const { addTransaction } = useBudget();
    const [desc, setDesc] = useState('');
    const [amount, setAmount] = useState('');
    const [type, setType] = useState<TransactionType>('expense');
    const [category, setCategory] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!desc || !amount) return;
        addTransaction({
            description: desc,
            amount: parseFloat(amount),
            type,
            category: category || 'Uncategorized',
            date: new Date().toISOString().split('T')[0]
        });
        setDesc('');
        setAmount('');
        setCategory('');
    };

    return (
        <div className="neo-box">
            <h3 style={{ borderBottom: '4px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>Add New Entry</h3>
            <form onSubmit={handleSubmit} className="form-stack">
                <div className="form-group">
                    <label>DESCRIPTION</label>
                    <input
                        className="neo-input"
                        placeholder="e.g. Tacos"
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
                        <option value="debt">DEBT PAYMENT</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>CATEGORY</label>
                    <input
                        className="neo-input"
                        placeholder="e.g. Food"
                        value={category}
                        onChange={e => setCategory(e.target.value)}
                    />
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
