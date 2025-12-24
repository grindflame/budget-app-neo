import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import { Plus, Trash2, Edit2, X } from 'lucide-react';

const DebtModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { debts, transactions, addDebt, editDebt, deleteDebt } = useBudget();

    // Internal state for managing the debt list interactions
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [name, setName] = useState('');
    const [startBal, setStartBal] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !startBal) return;

        if (editingId) {
            editDebt(editingId, { name, startingBalance: parseFloat(startBal) });
            setEditingId(null);
        } else {
            addDebt({ name, startingBalance: parseFloat(startBal) });
        }

        setName('');
        setStartBal('');
        setIsFormOpen(false);
    };

    const startEdit = (d: { id: string, name: string, startingBalance: number }) => {
        setEditingId(d.id);
        setName(d.name);
        setStartBal(d.startingBalance.toString());
        setIsFormOpen(true);
    };

    // Calculation Logic
    const getDebtStats = (debtId: string, initial: number) => {
        const debtTx = transactions.filter(t => t.debtAccountId === debtId);

        const payments = debtTx
            .filter(t => t.type === 'debt-payment' || (t.type as string) === 'debt')
            .reduce((sum, t) => sum + t.amount, 0);

        const interest = debtTx
            .filter(t => t.type === 'debt-interest')
            .reduce((sum, t) => sum + t.amount, 0);

        const current = initial - payments + interest;
        return { current, payments, interest };
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
            <div className="neo-box" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--neo-white)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '4px solid black', paddingBottom: '1rem' }}>
                    <h2 style={{ fontSize: '2rem', margin: 0 }}>DEBT ACCOUNTS</h2>
                    <button onClick={onClose} className="icon-btn"><X size={24} /></button>
                </div>

                {/* Add/Edit Form */}
                <div style={{ marginBottom: '2rem' }}>
                    {!isFormOpen ? (
                        <button
                            className="neo-btn"
                            onClick={() => { setIsFormOpen(true); setEditingId(null); setName(''); setStartBal(''); }}
                            style={{ background: 'var(--neo-yellow)', width: '100%', justifyContent: 'center' }}
                        >
                            <Plus size={24} /> ADD NEW DEBT ACCOUNT
                        </button>
                    ) : (
                        <div className="neo-box" style={{ border: '4px solid black', background: '#f9f9f9' }}>
                            <h4 style={{ marginTop: 0 }}>{editingId ? 'EDIT DEBT' : 'NEW DEBT'}</h4>
                            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontWeight: 'bold' }}>DEBT NAME</label>
                                    <input
                                        className="neo-input"
                                        placeholder="e.g. Student Loan"
                                        value={name} onChange={e => setName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontWeight: 'bold' }}>STARTING BALANCE ($)</label>
                                    <input
                                        className="neo-input"
                                        type="number" step="0.01"
                                        placeholder="0.00"
                                        value={startBal} onChange={e => setStartBal(e.target.value)}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button className="neo-btn pink" type="submit" style={{ flex: 1, justifyContent: 'center' }}>
                                        {editingId ? 'UPDATE' : 'CREATE'}
                                    </button>
                                    <button className="neo-btn white" type="button" onClick={() => setIsFormOpen(false)} style={{ flex: 1, justifyContent: 'center' }}>
                                        CANCEL
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>

                {/* List */}
                <div className="debts-stack">
                    {debts.map(d => {
                        const stats = getDebtStats(d.id, d.startingBalance);
                        const isPaidOff = stats.current <= 0;
                        return (
                            <div key={d.id} className="neo-box" style={{
                                background: isPaidOff ? '#e6fff2' : 'white',
                                display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                position: 'relative', border: '3px solid black'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0 }}>{d.name}</h3>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button onClick={() => startEdit(d)} className="icon-btn" title="Edit"><Edit2 size={16} /></button>
                                        <button onClick={() => { if (confirm("Delete this debt account?")) deleteDebt(d.id); }} className="icon-btn trash" title="Delete"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: isPaidOff ? 'var(--neo-green)' : 'var(--neo-pink)' }}>
                                    ${stats.current.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '0.85rem', gap: '0.5rem', opacity: 0.8 }}>
                                    <div>Started: <b>${d.startingBalance.toLocaleString()}</b></div>
                                    <div>Interest: <b style={{ color: 'var(--neo-pink)' }}>+${stats.interest.toLocaleString()}</b></div>
                                    <div>Payments: <b style={{ color: 'var(--neo-green)' }}>-${stats.payments.toLocaleString()}</b></div>
                                </div>
                            </div>
                        );
                    })}
                    {debts.length === 0 && (
                        <p style={{ textAlign: 'center', opacity: 0.5 }}>No debt accounts yet.</p>
                    )}
                </div>

            </div>
            <style>{`
                .debts-stack {
                    display: grid;
                    gap: 1rem;
                }
                .icon-btn {
                    background: none; border: 2px solid black; padding: 4px; cursor: pointer;
                    box-shadow: 2px 2px 0 black; transition: transform 0.1s;
                }
                .icon-btn:active { transform: translate(2px, 2px); box-shadow: none; }
                .icon-btn.trash { color: red; border-color: red; box-shadow: 2px 2px 0 red; }
            `}</style>
        </div>
    );
};

export const DebtsManager: React.FC = () => {
    const { debts, transactions } = useBudget();
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Calculate Total Outstanding Debt (Across all accounts)
    const totalDebt = debts.reduce((acc, d) => {
        // Copy paste logic or reuse? Reuse logic is cleaner but for now let's just calc inline for summary
        const debtTx = transactions.filter(t => t.debtAccountId === d.id);
        const payments = debtTx.filter(t => t.type === 'debt-payment' || t.type === 'debt').reduce((s, t) => s + t.amount, 0);
        const interest = debtTx.filter(t => t.type === 'debt-interest').reduce((s, t) => s + t.amount, 0);
        return acc + (d.startingBalance - payments + interest);
    }, 0);

    return (
        <>
            {isModalOpen && <DebtModal onClose={() => setIsModalOpen(false)} />}

            {/* Summary Card for Main Dashboard */}
            <div className="neo-box" style={{ background: 'var(--neo-pink)', color: 'black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.1s' }}
                onClick={() => setIsModalOpen(true)}
                title="Click to Manage Debt Accounts"
            >
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', opacity: 0.9 }}>TOTAL OUTSTANDING DEBT</h4>
                <div style={{ fontSize: '2.5rem', fontWeight: 900 }}>
                    ${totalDebt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold', textDecoration: 'underline' }}>
                    MANAGE ACCOUNTS ({debts.length})
                </div>
            </div>
        </>
    );
};
