import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import type { Transaction, TransactionType } from '../context/BudgetContext';
import { Trash2, Edit2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { TransactionModal } from './TransactionModal';

interface TransactionListProps {
    transactions: Transaction[];
    emptyLabel?: string;
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, emptyLabel = 'NO DATA' }) => {
    const { deleteTransaction, editTransaction } = useBudget();
    const [editingTx, setEditingTx] = useState<Transaction | null>(null);

    if (transactions.length === 0) {
        return (
            <div className="neo-box" style={{ textAlign: 'center', opacity: 0.7, minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h3>{emptyLabel}</h3>
            </div>
        );
    }

    // Sort by date desc
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const startEdit = (t: Transaction) => {
        const typ = t.type === 'debt' ? 'debt-payment' : t.type; // normalize legacy
        setEditingTx({ ...t, type: typ });
    };

    const closeEdit = () => setEditingTx(null);

    const formatDate = (dateStr: string) => {
        try {
            return format(parseISO(dateStr), 'MMM d, yyyy');
        } catch {
            return dateStr;
        }
    };

    const getTypeLabel = (t: TransactionType | 'debt') => {
        if (t === 'income') return '+';
        if (t === 'expense') return '-';
        if (t === 'debt-payment' || t === 'debt') return 'DEBT PMT';
        if (t === 'debt-interest') return 'DEBT INT';
        if ((t as string) === 'debt-charge') return 'DEBT CHG';
        if (t === 'asset-deposit') return 'SAVE';
        if (t === 'asset-growth') return 'GROW';
        return '';
    };

    const getTypeColor = (t: TransactionType | 'debt') => {
        if (t === 'income') return 'var(--neo-green)';
        if (t === 'expense') return 'black';
        if (t === 'debt-payment' || t === 'debt') return 'var(--neo-pink)';
        if (t === 'debt-interest') return '#888'; // Grey/Pink?
        if ((t as string) === 'debt-charge') return 'var(--neo-pink)';
        if (t === 'asset-deposit') return '#00F0FF'; // Cyan
        if (t === 'asset-growth') return 'var(--neo-green)';
        return 'black';
    };

    return (
        <div className="neo-box">
            <h3 style={{ borderBottom: '4px solid black', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>History</h3>
            <TransactionModal
                open={!!editingTx}
                initial={editingTx || undefined}
                onClose={closeEdit}
                onSubmit={(updated) => {
                    if (!editingTx) return;
                    editTransaction(editingTx.id, updated);
                }}
            />
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
                            return (
                                <tr key={t.id} className="row-hover">
                                    <td>
                                        {formatDate(t.date)}
                                    </td>

                                    <td style={{ fontWeight: 'bold' }}>
                                        <div>
                                            {t.description}
                                            {t.debtAccountId && <span className="pill pink">Linked Debt</span>}
                                            {t.assetAccountId && <span className="pill cyan">Linked Asset</span>}
                                        </div>
                                    </td>

                                    <td>
                                        <span className="badge">{t.category}</span>
                                    </td>

                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{
                                            color: getTypeColor(t.type),
                                            fontWeight: 900,
                                            fontSize: '1.1rem',
                                            display: 'flex', flexDirection: 'column', alignItems: 'flex-end'
                                        }}>
                                            <span>{t.type === 'expense' || t.type === 'debt-payment' || t.type === 'debt' || (t.type as string) === 'debt-charge' || t.type === 'asset-deposit' ? '-' : '+'}${t.amount.toFixed(2)}</span>
                                            <span style={{ fontSize: '0.6rem', opacity: 0.6 }}>{getTypeLabel(t.type)}</span>
                                        </div>
                                    </td>

                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                            <button onClick={() => startEdit(t)} className="action-btn edit" title="Edit">
                                                <Edit2 size={16} />
                                            </button>
                                            <button onClick={() => deleteTransaction(t.id)} className="action-btn delete" title="Delete">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
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
        
      `}</style>
        </div>
    );
};
