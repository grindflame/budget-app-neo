import React, { useMemo, useState } from 'react';
import { useBudget } from '../context/BudgetContext';
import type { RecurringRule, TransactionType } from '../context/BudgetContext';
import { Repeat, Plus, Trash2, Edit2, X } from 'lucide-react';
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
  "Other",
  "Uncategorized"
];

type RecurringForm = Omit<RecurringRule, 'id'>;

const RecurringModal: React.FC<{ onClose: () => void; defaultStartMonth: string }> = ({ onClose, defaultStartMonth }) => {
  const { recurring, addRecurring, editRecurring, deleteRecurring, toggleRecurring, debts, assets } = useBudget();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<RecurringForm>({
    enabled: true,
    description: '',
    amount: 0,
    type: 'expense',
    category: 'Uncategorized',
    dayOfMonth: 1,
    startMonth: defaultStartMonth,
    debtAccountId: undefined,
    assetAccountId: undefined
  });

  const isDebtRelated = form.type === 'debt-payment' || form.type === 'debt-interest' || (form.type as string) === 'debt-charge';
  const isAssetRelated = form.type === 'asset-deposit' || form.type === 'asset-growth';

  const resetForm = () => {
    setForm({
      enabled: true,
      description: '',
      amount: 0,
      type: 'expense',
      category: 'Uncategorized',
      dayOfMonth: 1,
      startMonth: defaultStartMonth,
      debtAccountId: undefined,
      assetAccountId: undefined
    });
  };

  const openCreate = () => {
    setEditingId(null);
    resetForm();
    setIsFormOpen(true);
  };

  const startEdit = (r: RecurringRule) => {
    setEditingId(r.id);
    setForm({
      enabled: r.enabled,
      description: r.description,
      amount: r.amount,
      type: r.type,
      category: r.category,
      dayOfMonth: r.dayOfMonth,
      startMonth: r.startMonth || defaultStartMonth,
      debtAccountId: r.debtAccountId,
      assetAccountId: r.assetAccountId
    });
    setIsFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description || !Number.isFinite(form.amount) || form.amount <= 0) return;
    if (!Number.isFinite(form.dayOfMonth) || form.dayOfMonth < 1 || form.dayOfMonth > 31) return;
    if (!form.startMonth || form.startMonth.length !== 7) return;

    const payload: RecurringForm = {
      ...form,
      // Normalize link fields based on type
      debtAccountId: isDebtRelated ? form.debtAccountId : undefined,
      assetAccountId: isAssetRelated ? form.assetAccountId : undefined
    };

    if (editingId) editRecurring(editingId, payload);
    else addRecurring(payload);

    setIsFormOpen(false);
    setEditingId(null);
    resetForm();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
    }}>
      <div className="neo-box" style={{ width: '90%', maxWidth: '750px', maxHeight: '90vh', overflowY: 'auto', background: 'var(--neo-white)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '4px solid black', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '2rem', margin: 0 }}>RECURRING RULES</h2>
          <button onClick={onClose} className="icon-btn"><X size={24} /></button>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          {!isFormOpen ? (
            <button className="neo-btn" onClick={openCreate} style={{ width: '100%', justifyContent: 'center', background: 'var(--neo-cyan)' }}>
              <Plus size={22} /> ADD RECURRING RULE
            </button>
          ) : (
            <div className="neo-box" style={{ border: '4px solid black', background: '#f9f9f9' }}>
              <h4 style={{ marginTop: 0 }}>{editingId ? 'EDIT RULE' : 'NEW RULE'}</h4>
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: 'bold' }}>START MONTH</label>
                    <input
                      className="neo-input"
                      type="month"
                      value={form.startMonth}
                      onChange={e => setForm(prev => ({ ...prev, startMonth: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: 'bold' }}>DAY OF MONTH (1–31)</label>
                    <input
                      className="neo-input"
                      type="number"
                      min={1}
                      max={31}
                      value={form.dayOfMonth}
                      onChange={e => setForm(prev => ({ ...prev, dayOfMonth: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontWeight: 'bold' }}>DESCRIPTION</label>
                  <input
                    className="neo-input"
                    placeholder="e.g. Rent, Spotify, Student Loan Payment"
                    value={form.description}
                    onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ fontWeight: 'bold' }}>AMOUNT ($)</label>
                    <input
                      className="neo-input"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={form.amount || ''}
                      onChange={e => setForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontWeight: 'bold' }}>TYPE</label>
                    <NeoSelect
                      className="neo-select"
                      value={String(form.type)}
                      onChange={(v) => {
                        setForm(prev => ({
                          ...prev,
                          type: v as TransactionType,
                          debtAccountId: undefined,
                          assetAccountId: undefined
                        }));
                      }}
                      options={[
                        { value: 'expense', label: 'Expense' },
                        { value: 'income', label: 'Income' },
                        { value: 'debt-payment', label: 'Debt Payment' },
                        { value: 'debt-interest', label: 'Debt Interest' },
                          { value: 'debt-charge', label: 'Debt Charge' },
                        { value: 'asset-deposit', label: 'Asset Deposit' },
                        { value: 'asset-growth', label: 'Asset Growth' },
                      ]}
                    />
                  </div>
                </div>

                {isDebtRelated && (
                  <div>
                    <label style={{ fontWeight: 'bold' }}>LINK TO DEBT ACCOUNT (OPTIONAL)</label>
                    <NeoSelect
                      className="neo-select"
                      style={{ border: '4px solid var(--neo-pink)' }}
                      value={form.debtAccountId || ''}
                      onChange={(v) => setForm(prev => ({ ...prev, debtAccountId: v || undefined }))}
                      options={[
                        { value: '', label: '-- No Account --' },
                        ...debts.map(d => ({ value: d.id, label: d.name })),
                      ]}
                    />
                  </div>
                )}

                {isAssetRelated && (
                  <div>
                    <label style={{ fontWeight: 'bold' }}>LINK TO ASSET ACCOUNT (OPTIONAL)</label>
                    <NeoSelect
                      className="neo-select"
                      style={{ border: '4px solid var(--neo-green)' }}
                      value={form.assetAccountId || ''}
                      onChange={(v) => setForm(prev => ({ ...prev, assetAccountId: v || undefined }))}
                      options={[
                        { value: '', label: '-- No Account --' },
                        ...assets.map(a => ({ value: a.id, label: a.name })),
                      ]}
                    />
                  </div>
                )}

                <div>
                  <label style={{ fontWeight: 'bold' }}>CATEGORY</label>
                  <NeoSelect
                    className="neo-select"
                    value={form.category}
                    onChange={(v) => setForm(prev => ({ ...prev, category: v }))}
                    options={CATEGORIES.map(c => ({ value: c, label: c }))}
                  />
                </div>

                <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', fontWeight: 900 }}>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
                  />
                  ENABLED
                </label>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button className="neo-btn pink" type="submit" style={{ flex: 1, justifyContent: 'center' }}>
                    {editingId ? 'UPDATE RULE' : 'CREATE RULE'}
                  </button>
                  <button
                    className="neo-btn white"
                    type="button"
                    onClick={() => { setIsFormOpen(false); setEditingId(null); resetForm(); }}
                    style={{ flex: 1, justifyContent: 'center' }}
                  >
                    CANCEL
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="rules-stack">
          {recurring.map(r => (
            <div key={r.id} className="neo-box" style={{ background: 'white', border: '3px solid black' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{r.description}</div>
                  <div style={{ opacity: 0.75, fontWeight: 700, marginTop: '0.25rem' }}>
                    ${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {r.type.toUpperCase()} · {r.category} · Day {r.dayOfMonth} · Start {r.startMonth}
                  </div>
                  {(r.debtAccountId || r.assetAccountId) && (
                    <div style={{ opacity: 0.75, fontWeight: 700, marginTop: '0.25rem' }}>
                      Linked: {r.debtAccountId ? 'Debt' : ''}{r.debtAccountId && r.assetAccountId ? ' + ' : ''}{r.assetAccountId ? 'Asset' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 900 }}>
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={e => toggleRecurring(r.id, e.target.checked)}
                    />
                    ON
                  </label>
                  <button onClick={() => startEdit(r)} className="icon-btn" title="Edit"><Edit2 size={16} /></button>
                  <button onClick={() => { if (confirm("Delete this recurring rule?")) deleteRecurring(r.id); }} className="icon-btn trash" title="Delete"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
          {recurring.length === 0 && (
            <p style={{ textAlign: 'center', opacity: 0.6, fontWeight: 700 }}>No recurring rules yet.</p>
          )}
        </div>

        <style>{`
          .rules-stack {
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
    </div>
  );
};

export const RecurringManager: React.FC<{ currentMonth: string }> = ({ currentMonth }) => {
  const { recurring } = useBudget();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const enabledCount = useMemo(() => recurring.filter(r => r.enabled).length, [recurring]);

  return (
    <>
      {isModalOpen && <RecurringModal onClose={() => setIsModalOpen(false)} defaultStartMonth={currentMonth} />}

      <div
        className="neo-box"
        style={{
          background: 'var(--neo-cyan)',
          color: 'black',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer'
        }}
        onClick={() => setIsModalOpen(true)}
        title="Click to Manage Recurring Rules"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Repeat size={20} />
          <h4 style={{ fontSize: '0.9rem', marginBottom: 0, opacity: 0.9 }}>RECURRING</h4>
        </div>
        <div style={{ fontSize: '2.5rem', fontWeight: 900, marginTop: '0.5rem' }}>
          {enabledCount}/{recurring.length}
        </div>
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 'bold', textDecoration: 'underline' }}>
          MANAGE RULES
        </div>
      </div>
    </>
  );
};


