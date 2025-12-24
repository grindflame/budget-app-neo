import React, { useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import { Plus, Trash2, Edit2, X, TrendingUp } from 'lucide-react';

const AssetModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { assets, transactions, addAsset, editAsset, deleteAsset } = useBudget();

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [name, setName] = useState('');
    const [startBal, setStartBal] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !startBal) return;

        if (editingId) {
            editAsset(editingId, { name, startingBalance: parseFloat(startBal) });
            setEditingId(null);
        } else {
            addAsset({ name, startingBalance: parseFloat(startBal) });
        }

        setName('');
        setStartBal('');
        setIsFormOpen(false);
    };

    const startEdit = (a: { id: string, name: string, startingBalance: number }) => {
        setEditingId(a.id);
        setName(a.name);
        setStartBal(a.startingBalance.toString());
        setIsFormOpen(true);
    };

    // Calculation Logic
    const getAssetStats = (assetId: string, initial: number) => {
        const assetTx = transactions.filter(t => t.assetAccountId === assetId);

        const deposits = assetTx
            .filter(t => t.type === 'asset-deposit')
            .reduce((sum, t) => sum + t.amount, 0);

        const growth = assetTx
            .filter(t => t.type === 'asset-growth')
            .reduce((sum, t) => sum + t.amount, 0);

        const current = initial + deposits + growth;
        return { current, deposits, growth };
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
            <div className="neo-box" style={{ width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--neo-white)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '4px solid black', paddingBottom: '1rem' }}>
                    <h2 style={{ fontSize: '2rem', margin: 0 }}>ASSET / SAVINGS ACCOUNTS</h2>
                    <button onClick={onClose} className="icon-btn"><X size={24} /></button>
                </div>

                {/* Add/Edit Form */}
                <div style={{ marginBottom: '2rem' }}>
                    {!isFormOpen ? (
                        <button
                            className="neo-btn"
                            onClick={() => { setIsFormOpen(true); setEditingId(null); setName(''); setStartBal(''); }}
                            style={{ background: 'var(--neo-green)', width: '100%', justifyContent: 'center' }}
                        >
                            <Plus size={24} /> ADD NEW ASSET
                        </button>
                    ) : (
                        <div className="neo-box" style={{ border: '4px solid black', background: '#f9f9f9' }}>
                            <h4 style={{ marginTop: 0 }}>{editingId ? 'EDIT ASSET' : 'NEW ASSET'}</h4>
                            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontWeight: 'bold' }}>ACCOUNT NAME</label>
                                    <input
                                        className="neo-input"
                                        placeholder="e.g. 401k, High Yield Savings"
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
                <div className="stack">
                    {assets.map(a => {
                        const stats = getAssetStats(a.id, a.startingBalance);
                        return (
                            <div key={a.id} className="neo-box" style={{
                                background: 'white',
                                display: 'flex', flexDirection: 'column', gap: '0.5rem',
                                position: 'relative', border: '3px solid black'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0 }}>{a.name}</h3>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button onClick={() => startEdit(a)} className="icon-btn" title="Edit"><Edit2 size={16} /></button>
                                        <button onClick={() => { if (confirm("Delete this asset account?")) deleteAsset(a.id); }} className="icon-btn trash" title="Delete"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--neo-green)' }}>
                                    ${stats.current.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '0.85rem', gap: '0.5rem', opacity: 0.8 }}>
                                    <div>Started: <b>${a.startingBalance.toLocaleString()}</b></div>
                                    <div>Contributions: <b style={{ color: 'var(--neo-green)' }}>+${stats.deposits.toLocaleString()}</b></div>
                                    <div>Growth/Interest: <b style={{ color: 'var(--neo-green)' }}>+${stats.growth.toLocaleString()}</b></div>
                                </div>
                            </div>
                        );
                    })}
                    {assets.length === 0 && (
                        <p style={{ textAlign: 'center', opacity: 0.5 }}>No asset accounts yet. Start saving!</p>
                    )}
                </div>

            </div>
            <style>{`
                .stack {
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

export const AssetsManager: React.FC = () => {
    const { assets, transactions } = useBudget();
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Calculate Total Assets
    const totalAssets = assets.reduce((acc, a) => {
        const assetTx = transactions.filter(t => t.assetAccountId === a.id);
        const deposits = assetTx.filter(t => t.type === 'asset-deposit').reduce((s, t) => s + t.amount, 0);
        const growth = assetTx.filter(t => t.type === 'asset-growth').reduce((s, t) => s + t.amount, 0);
        return acc + (a.startingBalance + deposits + growth);
    }, 0);

    return (
        <>
            {isModalOpen && <AssetModal onClose={() => setIsModalOpen(false)} />}

            {/* Summary Card for Main Dashboard */}
            <div className="neo-box" style={{ background: 'var(--neo-green)', color: 'black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.1s' }}
                onClick={() => setIsModalOpen(true)}
                title="Click to Manage Asset Accounts"
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp size={20} />
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0', opacity: 0.9 }}>TOTAL ASSETS / SAVINGS</h4>
                </div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, marginTop: '0.5rem' }}>
                    ${totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold', textDecoration: 'underline' }}>
                    MANAGE ACCOUNTS ({assets.length})
                </div>
            </div>
        </>
    );
};
