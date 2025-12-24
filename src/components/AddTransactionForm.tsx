import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import type { TransactionType } from '../context/BudgetContext';
import { Plus } from 'lucide-react';

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
        <div className="neo-box" style={{ marginBottom: '2rem' }}>
            <h3>Add New Entry</h3>
            <form onSubmit={handleSubmit} className="form-grid">
                <input
                    className="neo-input"
                    placeholder="Description"
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                />
                <input
                    className="neo-input"
                    type="number"
                    placeholder="Amount"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                />
                <select
                    className="neo-input"
                    value={type}
                    onChange={e => setType(e.target.value as TransactionType)}
                >
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                    <option value="debt">Debt Payment</option>
                </select>
                <input
                    className="neo-input"
                    placeholder="Category (e.g. Food)"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                />

                <button type="submit" className="neo-btn" style={{ justifyContent: 'center' }}>
                    <Plus size={20} /> Add
                </button>
            </form>
            <style>{`
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
          align-items: center;
        }
      `}</style>
        </div>
    );
};
