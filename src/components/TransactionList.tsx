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
        return <div className="neo-box text-center">No transactions yet. Start budgetmaxxing.</div>;
    }

    return (
        <div className="neo-box">
            <h3>Recent History</h3>
            <div className="table-responsive">
                <table className="neo-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Desc</th>
                            <th>Category</th>
                            <th>Amount</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.slice().reverse().map(t => (
                            <tr key={t.id} style={{
                                background: t.type === 'income' ? '#e6fffa' :
                                    t.type === 'debt' ? '#fff5f5' : 'transparent'
                            }}>
                                <td>{t.date}</td>
                                <td>{t.description}</td>
                                <td>
                                    <span className="badge">{t.category}</span>
                                </td>
                                <td style={{
                                    color: t.type === 'income' ? 'green' :
                                        t.type === 'debt' ? 'red' : 'black',
                                    fontWeight: 'bold'
                                }}>
                                    {t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}
                                </td>
                                <td>
                                    <button
                                        onClick={() => deleteTransaction(t.id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'red'
                                        }}
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
          border: 3px solid black;
        }
        .neo-table th, .neo-table td {
          border: 3px solid black;
          padding: 0.75rem;
          text-align: left;
        }
        .neo-table th {
          background: var(--neo-blue);
        }
        .badge {
          background: var(--neo-black);
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          text-transform: uppercase;
        }
      `}</style>
        </div>
    );
};
