import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import { Plus, Trash2, Edit2, X } from 'lucide-react';

export const DebtsManager: React.FC = () => {
    const { debts, transactions, addDebt, editDebt, deleteDebt } = useBudget();
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
    // Current Balance = Starting Balance - (Payments) + (Interest)
    const getDebtStats = (debtId: string, initial: number) => {
        const debtTx = transactions.filter(t => t.debtAccountId === debtId);

        const payments = debtTx
            .filter(t => t.type === 'debt-payment' || (t.type as string) === 'debt')
            .reduce((sum, t) => sum + t.amount, 0);

        const interest = debtTx
            .filter(t => t.type === 'debt-interest')
            .reduce((sum, t) => sum + t.amount, 0);

        const current = initial - payments + interest;

        // Progress % (paid off)
        // If initial is 1000, current is 800. Paid 200. Progress 20%.
        // Caution: If interest is added, balance could go up.
        // Let's stick to simple "Current Balance" and maybe "Paid YTD".

        return { current, payments, interest };
    };

    return (
        <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '2rem', margin: 0, borderBottom: '4px solid black' }}>DEBT ACCOUNTS</h2>
                <button
                    className="neo-btn"
                    onClick={() => {
                        setIsFormOpen(!isFormOpen);
                        setEditingId(null);
                        setName('');
                        setStartBal('');
                    }}
                    style={{ background: isFormOpen ? '#ccc' : 'var(--neo-yellow)' }}
                >
                    {isFormOpen ? <X size={24} /> : <Plus size={24} />}
                    {isFormOpen ? ' CANCEL' : ' ADD DEBT'}
                </button>
            </div>

            {isFormOpen && (
                <div className="neo-box" style={{ marginBottom: '2rem', border: '4px solid black' }}>
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
                        <button className="neo-btn pink" type="submit">
                            {editingId ? 'UPDATE DEBT' : 'CREATE DEBT'}
                        </button>
                    </form>
                </div>
            )}

            {/* List of Debts */}
            <div className="debts-grid">
                {debts.map(d => {
                    const stats = getDebtStats(d.id, d.startingBalance);
                    const isPaidOff = stats.current <= 0;

                    return (
                        <div key={d.id} className="neo-box" style={{
                            background: isPaidOff ? '#e6fff2' : 'white',
                            display: 'flex', flexDirection: 'column', gap: '1rem',
                            position: 'relative'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h3 style={{ margin: 0, fontSize: '1.4rem' }}>{d.name}</h3>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button onClick={() => startEdit(d)} className="icon-btn"><Edit2 size={16} /></button>
                                    <button onClick={() => { if (confirm("Delete this debt account?")) deleteDebt(d.id); }} className="icon-btn trash"><Trash2 size={16} /></button>
                                </div>
                            </div>

                            <div className="stats-row">
                                <div>
                                    <label>CURRENT BAL</label>
                                    <div className="val" style={{ color: isPaidOff ? 'var(--neo-green)' : 'var(--neo-pink)' }}>
                                        ${stats.current.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div>
                                    <label>STARTING</label>
                                    <div className="val">${d.startingBalance.toLocaleString()}</div>
                                </div>
                            </div>

                            <div className="info-grid">
                                <div>
                                    <span>PAYMENTS:</span>
                                    <span style={{ fontWeight: 'bold', color: 'var(--neo-green)' }}> -${stats.payments.toLocaleString()}</span>
                                </div>
                                <div>
                                    <span>INTEREST:</span>
                                    <span style={{ fontWeight: 'bold', color: 'var(--neo-pink)' }}> +${stats.interest.toLocaleString()}</span>
                                </div>
                            </div>

                            {isPaidOff && (
                                <div style={{
                                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-15deg)',
                                    border: '4px solid var(--neo-green)', padding: '0.5rem 1rem', fontSize: '2rem', fontWeight: 900,
                                    color: 'var(--neo-green)', background: 'rgba(255,255,255,0.9)', pointerEvents: 'none'
                                }}>
                                    PAID OFF
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {debts.length === 0 && !isFormOpen && (
                <div className="neo-box" style={{ textAlign: 'center', opacity: 0.6 }}>
                    <h3 style={{ margin: 0 }}>NO DEBTS TRACKED. YOU ARE FREE! (OR ADD ONE)</h3>
                </div>
            )}

            <style>{`
                .debts-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 1.5rem;
                }
                .label, label {
                    font-size: 0.8rem;
                    font-weight: 900;
                    opacity: 0.6;
                    display: block;
                }
                .val {
                    font-size: 1.8rem;
                    font-weight: 900;
                }
                .stats-row {
                    display: flex;
                    gap: 2rem;
                    border-bottom: 2px solid #eee;
                    padding-bottom: 1rem;
                }
                .info-grid {
                    display: grid;
                    gap: 0.5rem;
                    font-size: 0.9rem;
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
