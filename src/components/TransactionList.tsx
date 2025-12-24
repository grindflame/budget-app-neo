import React from 'react';
import { useBudget } from '../context/BudgetContext';
import type { Transaction } from '../context/BudgetContext';
import { Trash2 } from 'lucide-react';

interface TransactionListProps {
    transactions: Transaction[];
}

export const TransactionList: React.FC<TransactionListProps> = ({ transactions }) => {
    const { deleteTransaction } = useBudget();

    if (transactions.length === 0) {
        return (
            <div className="neo-box" style={{ textAlign: 'center', opacity: 0.7, minHeight: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <h3>NO DATA FOR THIS MONTH</h3>
            </div>
        );
    }

    // Sort by date desc
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
                            <th style={{ width: '50px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map(t => (
                            <tr key={t.id} className="row-hover">
                                <td>{t.date}</td>
                                <td style={{ fontWeight: 'bold' }}>{t.description}</td>
                                <td>
                                    <span className="badge">{t.category}</span>
                                </td>
                                <td style={{
                                    textAlign: 'right',
                                    color: t.type === 'income' ? 'var(--neo-green)' :
                                        t.type === 'debt' ? 'var(--neo-pink)' : 'black',
                                    fontWeight: 900,
                                    fontSize: '1.1rem'
                                }}>
                                    {t.type === 'income' ? '+' : ''}{t.type === 'expense' ? '-' : ''}
                                    ${t.amount.toFixed(2)}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <button
                                        onClick={() => deleteTransaction(t.id)}
                                        className="delete-btn"
                                        title="Delete"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
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
        .delete-btn {
            background: none;
            border: 2px solid transparent;
            cursor: pointer;
            color: #aaa;
            padding: 4px;
            transition: all 0.2s;
        }
        .delete-btn:hover {
            color: red;
            background: #ffe6e6;
            border: 2px solid red;
            box-shadow: 2px 2px 0 red;
        }
      `}</style>
        </div>
    );
};
