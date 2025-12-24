import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import type { Transaction, TransactionType } from '../context/BudgetContext';
import { Trash2, Edit2, Save, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';

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
    "Other",
    "Uncategorized"
];

interface TransactionListProps {
    transactions: Transaction[];
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions }) => {
    const { deleteTransaction, editTransaction } = useBudget();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Omit<Transaction, 'id'>>({
        date: '',
        description: '',
        amount: 0,
        type: 'expense',
        category: ''
    });

    if (transactions.length === 0) {
        return (
            <div className="neo-box" style={{ textAlign: 'center', opacity: 0.7, minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h3>NO DATA FOR THIS MONTH</h3>
            </div>
        );
    }

    // Sort by date desc
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const startEdit = (t: Transaction) => {
        setEditingId(t.id);
        const typ = t.type === 'debt' ? 'debt-payment' : t.type; // normalize legacy
        setEditForm({
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: typ,
            category: t.category,
            debtAccountId: t.debtAccountId,
            assetAccountId: t.assetAccountId
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    const saveEdit = (id: string) => {
        editTransaction(id, editForm);
        setEditingId(null);
    };

    const formatDate = (dateStr: string) => {
        try {
            return format(parseISO(dateStr), 'MMM d, yyyy');
        } catch (e) {
            return dateStr;
        }
    };

    const getTypeLabel = (t: TransactionType | 'debt') => {
        if (t === 'income') return '+';
        if (t === 'expense') return '-';
        if (t === 'debt-payment' || t === 'debt') return 'DEBT PMT';
        if (t === 'debt-interest') return 'DEBT INT';
        if (t === 'asset-deposit') return 'SAVE';
        if (t === 'asset-growth') return 'GROW';
        return '';
    };

    const getTypeColor = (t: TransactionType | 'debt') => {
        if (t === 'income') return 'var(--neo-green)';
        if (t === 'expense') return 'black';
        if (t === 'debt-payment' || t === 'debt') return 'var(--neo-pink)';
        if (t === 'debt-interest') return '#888'; // Grey/Pink?
        if (t === 'asset-deposit') return '#00F0FF'; // Cyan
        if (t === 'asset-growth') return 'var(--neo-green)';
        return 'black';
    };

    return (
        <div className="neo-box">
            <h3 style={{ borderBottom: '4px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>History</h3>
            <div className="table-responsive">
                <table className="neo-table">
                    <thead>
                        <tr>
                            <th>DATE</th>
                            <th>DESC</th>
                            <th>CATEGORY</th>
                            <th style={{ textAlign: 'right' }}>AMOUNT</th>
                            <th style={{ width: '80px', textAlign: 'center' }}>ACT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(t => {
                            const isEditing = editingId === t.id;
                            return (
                                <tr key={t.id} className={isEditing ? 'row-editing' : 'row-hover'}>
                                    {/* DATE */}
                                    <td>
                                        {isEditing ? (
                                            <input
                                                className="edit-input"
                                                type="date"
                                                value={editForm.date}
                                                onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                                            />
                                        ) : (
                                            formatDate(t.date)
                                        )}
                                    </td>

                                    {/* DESCRIPTION */}
                                    <td style={{ fontWeight: 'bold' }}>
                                        {isEditing ? (
                                            <input
                                                className="edit-input"
                                                value={editForm.description}
                                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                            />
                                        ) : (
                                            <div>
                                                {t.description}
                                                {t.debtAccountId && <span className="pill pink">Linked Debt</span>}
                                                {t.assetAccountId && <span className="pill cyan">Linked Asset</span>}
                                            </div>
                                        )}
                                    </td>

                                    {/* CATEGORY */}
                                    <td>
                                        {isEditing ? (
                                            <select
                                                className="edit-input"
                                                value={editForm.category}
                                                onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                                            >
                                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                <option value="Uncategorized">Uncategorized</option>
                                            </select>
                                        ) : (
                                            <span className="badge">{t.category}</span>
                                        )}
                                    </td>

                                    {/* AMOUNT & TYPE */}
                                    <td style={{ textAlign: 'right' }}>
                                        {isEditing ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                                                <select
                                                    className="edit-input"
                                                    style={{ width: '100px', padding: '0 2px', fontSize: '0.7rem' }}
                                                    value={editForm.type}
                                                    onChange={e => setEditForm({ ...editForm, type: e.target.value as TransactionType })}
                                                >
                                                    <option value="expense">EXPENSE</option>
                                                    <option value="income">INCOME</option>
                                                    <option value="debt-payment">DEBT PMT</option>
                                                    <option value="debt-interest">DEBT INT</option>
                                                    <option value="asset-deposit">ASSET DEPOSIT</option>
                                                    <option value="asset-growth">ASSET GROWTH</option>
                                                </select>
                                                <input
                                                    className="edit-input"
                                                    type="number"
                                                    style={{ width: '80px', textAlign: 'right' }}
                                                    value={editForm.amount}
                                                    onChange={e => setEditForm({ ...editForm, amount: parseFloat(e.target.value) })}
                                                />
                                            </div>
                                        ) : (
                                            <div style={{
                                                color: getTypeColor(t.type),
                                                fontWeight: 900,
                                                fontSize: '1.1rem',
                                                display: 'flex', flexDirection: 'column', alignItems: 'flex-end'
                                            }}>
                                                <span>{t.type === 'expense' || t.type === 'debt-payment' || t.type === 'debt' || t.type === 'asset-deposit' ? '-' : '+'}${t.amount.toFixed(2)}</span>
                                                <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>{getTypeLabel(t.type)}</span>
                                            </div>
                                        )}
                                    </td>

                                    {/* ACTIONS */}
                                    <td style={{ textAlign: 'center' }}>
                                        {isEditing ? (
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                <button onClick={() => saveEdit(t.id)} className="action-btn save" title="Save">
                                                    <Save size={16} />
                                                </button>
                                                <button onClick={cancelEdit} className="action-btn cancel" title="Cancel">
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                <button onClick={() => startEdit(t)} className="action-btn edit" title="Edit">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={() => deleteTransaction(t.id)} className="action-btn delete" title="Delete">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <style>{`
        .table-responsive {
          overflow-x: auto;
        }
        .neo-table {
          width: 100%;
          border-collapse: collapse;
          border: 4px solid black;
        }
        .neo-table th {
            background: black;
            color: white;
            text-transform: uppercase;
            padding: 1rem;
            text-align: left;
            border-bottom: 4px solid black;
            font-size: 0.9rem;
        }
        .neo-table td {
            padding: 1rem;
            border-bottom: 2px solid #eee;
            vertical-align: middle;
        }
        .row-hover:hover {
            background: #f0f0f0;
        }
        .row-editing {
            background: #fffbe6;
        }
        .badge {
          background: #eee;
          border: 2px solid black;
          color: black;
          padding: 4px 8px;
          font-weight: bold;
          font-size: 0.75rem;
          text-transform: uppercase;
          box-shadow: 2px 2px 0 black;
        }
        
        .pill {
            font-size: 0.65rem;
            padding: 2px 6px;
            border: 1px solid black;
            margin-left: 6px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .pill.pink { background: var(--neo-pink); }
        .pill.cyan { background: var(--neo-cyan); }

        .action-btn {
            background: none;
            border: 2px solid black;
            cursor: pointer;
            padding: 4px;
            transition: all 0.1s;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 2px 2px 0 black;
        }
        .action-btn:active {
            transform: translate(2px, 2px);
            box-shadow: 0 0 0 black;
        }
        .action-btn.edit { background: white; }
        .action-btn.delete { background: white; color: red; border-color: red; box-shadow: 2px 2px 0 red; }
        .action-btn.delete:hover { background: #ffe6e6; }
        
        .action-btn.save { background: var(--neo-green); color: black; }
        .action-btn.cancel { background: white; }

        .edit-input {
            border: 2px solid black;
            padding: 4px;
            font-family: inherit;
            font-size: 0.9rem;
            width: 100%;
            background: white;
        }
      `}</style>
        </div>
    );
};
