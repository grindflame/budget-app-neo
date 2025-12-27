import React, { useEffect, useMemo, useState } from 'react';
import { X, KeyRound, ShieldCheck, Link2, RefreshCw, Unlink2 } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { NeoSelect } from './NeoSelect';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ open, onClose }) => {
  const {
    user,
    updatePassword,
    saveOpenRouterKey,
    simplefinStatus,
    simplefinClaim,
    simplefinDisconnect,
    simplefinSync,
    getSimplefinAccounts,
    getSimplefinAccountMap,
    setSimplefinAccountMap,
    applySimplefinAccountMapToExisting,
    transactions,
    debts,
    assets,
    addDebt,
    addAsset,
    editDebt,
    editAsset,
  } = useBudget();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState(user?.openRouterKey || '');
  const [saving, setSaving] = useState(false);
  const [simplefinToken, setSimplefinToken] = useState('');
  const [simplefinConnected, setSimplefinConnected] = useState<boolean>(false);
  const [simplefinDaysBack, setSimplefinDaysBack] = useState<number>(60);
  const [simplefinIncludePending, setSimplefinIncludePending] = useState<boolean>(false);
  const [simplefinBusy, setSimplefinBusy] = useState<boolean>(false);
  const [showSimplefinAccounts, setShowSimplefinAccounts] = useState<boolean>(false);

  if (!open) return null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const ok = await simplefinStatus();
      if (!cancelled) setSimplefinConnected(ok);
    })();
    return () => { cancelled = true; };
  }, [user, simplefinStatus, open]);

  const simplefinAccounts = useMemo(() => getSimplefinAccounts(), [getSimplefinAccounts, open]);
  const simplefinAccountMap = useMemo(() => getSimplefinAccountMap(), [getSimplefinAccountMap, open]);

  const debtComputed = useMemo(() => {
    const byId = new Map<string, { current: number; interest30: number; aprPct: number | null }>();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    for (const d of debts) {
      const debtTx = transactions.filter(t => t.debtAccountId === d.id);
      const payments = debtTx
        .filter(t => t.type === 'debt-payment' || (t.type as string) === 'debt')
        .reduce((sum, t) => sum + t.amount, 0);
      const charges = debtTx
        .filter(t => (t.type as string) === 'debt-charge')
        .reduce((sum, t) => sum + t.amount, 0);
      const interest = debtTx
        .filter(t => t.type === 'debt-interest')
        .reduce((sum, t) => sum + t.amount, 0);
      const current = d.startingBalance + charges - payments + interest;

      const interest30 = debtTx
        .filter(t => t.type === 'debt-interest' && t.date >= cutoff)
        .reduce((sum, t) => sum + t.amount, 0);

      const aprPct = (current > 0 && interest30 > 0)
        ? (interest30 / current) * 12 * 100
        : null;

      byId.set(d.id, { current, interest30, aprPct });
    }
    return byId;
  }, [debts, transactions]);

  const assetComputed = useMemo(() => {
    const byId = new Map<string, { current: number }>();
    for (const a of assets) {
      const assetTx = transactions.filter(t => t.assetAccountId === a.id);
      const deposits = assetTx
        .filter(t => t.type === 'asset-deposit')
        .reduce((sum, t) => sum + t.amount, 0);
      const growth = assetTx
        .filter(t => t.type === 'asset-growth')
        .reduce((sum, t) => sum + t.amount, 0);
      byId.set(a.id, { current: a.startingBalance + deposits + growth });
    }
    return byId;
  }, [assets, transactions]);

  const updateMapEntry = (accountId: string, next: { kind?: 'cash' | 'debt' | 'asset' | 'ignore'; debtAccountId?: string; assetAccountId?: string }) => {
    const prev = simplefinAccountMap[accountId] || { kind: 'cash' as const };
    const merged = {
      ...prev,
      ...next,
      // clean irrelevant link fields
      debtAccountId: (next.kind && next.kind !== 'debt') ? undefined : (next.debtAccountId ?? prev.debtAccountId),
      assetAccountId: (next.kind && next.kind !== 'asset') ? undefined : (next.assetAccountId ?? prev.assetAccountId),
    };
    setSimplefinAccountMap({ ...simplefinAccountMap, [accountId]: merged });
  };

  const createAndLinkDebt = (accountId: string, accountName: string) => {
    const name = `Debt: ${accountName}`;
    addDebt({ name, startingBalance: 0 });
    // We can't know the new ID synchronously, so ask user to select it after creation.
    alert(`Created debt account "${name}" with $0 starting balance. Now select it in the dropdown to link.`);
    updateMapEntry(accountId, { kind: 'debt' });
  };

  const createAndLinkAsset = (accountId: string, accountName: string) => {
    const name = `Asset: ${accountName}`;
    addAsset({ name, startingBalance: 0 });
    alert(`Created asset account "${name}" with $0 starting balance. Now select it in the dropdown to link.`);
    updateMapEntry(accountId, { kind: 'asset' });
  };

  const applyStartingBalanceFromSimplefin = (kind: 'debt' | 'asset', linkedId: string, reportedBalance: string | undefined, accountName: string) => {
    if (!reportedBalance) {
      alert('No balance available from SimpleFIN for this account.');
      return;
    }
    const n = Number(reportedBalance);
    if (!Number.isFinite(n)) {
      alert('SimpleFIN balance is not a number.');
      return;
    }
    const abs = Math.abs(n);
    const ok = confirm(
      `Set starting balance for "${accountName}" to $${abs.toFixed(2)}?\n\n` +
      `This is useful for ongoing tracking, but if you imported historical transactions, you may need to reconcile (balances might not match perfectly).`
    );
    if (!ok) return;

    if (kind === 'debt') {
      editDebt(linkedId, { name: debts.find(d => d.id === linkedId)?.name || accountName, startingBalance: abs });
    } else {
      editAsset(linkedId, { name: assets.find(a => a.id === linkedId)?.name || accountName, startingBalance: abs });
    }
    alert('Starting balance updated.');
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updatePassword(currentPw, newPw);
    setSaving(false);
    setCurrentPw('');
    setNewPw('');
  };

  const handleKeySave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await saveOpenRouterKey(openRouterKey.trim());
    setSaving(false);
  };

  const handleSimplefinConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSimplefinBusy(true);
    const ok = await simplefinClaim(simplefinToken);
    if (ok) {
      setSimplefinToken('');
      setSimplefinConnected(true);
    }
    setSimplefinBusy(false);
  };

  const handleSimplefinDisconnect = async () => {
    if (!user) return;
    if (!confirm('Disconnect SimpleFIN? You can reconnect later with a new setup token.')) return;
    setSimplefinBusy(true);
    const ok = await simplefinDisconnect();
    if (ok) setSimplefinConnected(false);
    setSimplefinBusy(false);
  };

  const handleSimplefinSync = async () => {
    if (!user) return;
    setSimplefinBusy(true);
    const result = await simplefinSync(simplefinDaysBack, simplefinIncludePending);
    setSimplefinBusy(false);
    const errText = result.errors.length ? `\n\nServer messages:\n- ${result.errors.join('\n- ')}` : '';
    alert(`Imported ${result.added} new transactions from SimpleFIN.${errText}`);
  };

  const handleApplyAccountMap = () => {
    const r = applySimplefinAccountMapToExisting();
    alert(`Applied mapping/categorization to ${r.updated} existing SimpleFIN transactions.`);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div
        className="neo-box"
        style={{
          width: '95%',
          maxWidth: '520px',
          background: 'var(--neo-white)',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <X size={22} />
        </button>
        <h3 style={{ marginTop: 0, borderBottom: '4px solid black', paddingBottom: '0.75rem' }}>
          PROFILE & SECURITY
        </h3>
        {user ? (
          <p style={{ fontWeight: 900, marginBottom: '1rem' }}>Logged in as <span style={{ color: 'var(--neo-pink)' }}>{user.email}</span></p>
        ) : (
          <p style={{ color: 'red', fontWeight: 900 }}>Log in first to manage profile.</p>
        )}

        <div style={{ display: 'grid', gap: '1.5rem' }}>
          <form onSubmit={handlePasswordSave} className="neo-box" style={{ border: '3px dashed black', background: '#fffdf5' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <KeyRound size={18} />
              <strong>Change Password</strong>
            </div>
            <label style={{ fontWeight: 900, fontSize: '0.8rem' }}>Current Password</label>
            <input
              type="password"
              className="neo-input"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
              placeholder="Existing password"
              required
            />
            <label style={{ fontWeight: 900, fontSize: '0.8rem', marginTop: '0.75rem' }}>New Password</label>
            <input
              type="password"
              className="neo-input"
              value={newPw}
              onChange={e => setNewPw(e.target.value)}
              placeholder="New password"
              required
            />
            <button type="submit" className="neo-btn yellow" disabled={saving || !user} style={{ marginTop: '0.75rem' }}>
              {saving ? 'Saving...' : 'Update Password'}
            </button>
          </form>

          <form onSubmit={handleKeySave} className="neo-box" style={{ border: '3px dashed black', background: '#f2fbff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <ShieldCheck size={18} />
              <strong>OpenRouter API Key</strong>
            </div>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: 0 }}>
              Stored securely in your account so imports can call OpenRouter without pasting the key each time.
            </p>
            <input
              type="password"
              className="neo-input"
              value={openRouterKey}
              onChange={e => setOpenRouterKey(e.target.value)}
              placeholder="sk-or-v1-..."
              required
            />
            <button type="submit" className="neo-btn" disabled={saving || !user} style={{ marginTop: '0.75rem', background: '#00F0FF' }}>
              {saving ? 'Saving...' : 'Save Key'}
            </button>
          </form>

          <form onSubmit={handleSimplefinConnect} className="neo-box" style={{ border: '3px dashed black', background: '#f7fff4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Link2 size={18} />
              <strong>SimpleFIN Connection</strong>
              <span className="badge" style={{ marginLeft: 'auto' }}>
                {simplefinConnected ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, marginTop: 0 }}>
              Paste a SimpleFIN Setup Token (base64) or claim URL. You can generate a token from{' '}
              <a href="https://bridge.simplefin.org/simplefin/create" target="_blank" rel="noreferrer">bridge.simplefin.org</a>.
            </p>
            <input
              type="password"
              className="neo-input"
              value={simplefinToken}
              onChange={e => setSimplefinToken(e.target.value)}
              placeholder="Paste setup token / claim URL"
              disabled={!user || simplefinBusy || simplefinConnected}
            />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <button
                type="submit"
                className="neo-btn"
                disabled={simplefinBusy || !user || simplefinConnected || !simplefinToken.trim()}
                style={{ background: '#B6FF00' }}
              >
                {simplefinBusy ? 'Working...' : 'Connect'}
              </button>
              <button
                type="button"
                className="neo-btn white"
                disabled={simplefinBusy || !user || !simplefinConnected}
                onClick={handleSimplefinDisconnect}
              >
                <Unlink2 size={16} /> Disconnect
              </button>
            </div>

            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1rem' }}>
              <label style={{ fontWeight: 900, fontSize: '0.8rem' }}>Sync Range (days back, max 366)</label>
              <input
                type="number"
                className="neo-input"
                min={1}
                max={366}
                value={simplefinDaysBack}
                onChange={e => setSimplefinDaysBack(Math.max(1, Math.min(366, Number(e.target.value) || 60)))}
                disabled={!user || simplefinBusy || !simplefinConnected}
              />
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontWeight: 900, fontSize: '0.85rem' }}>
                <input
                  type="checkbox"
                  checked={simplefinIncludePending}
                  onChange={e => setSimplefinIncludePending(e.target.checked)}
                  disabled={!user || simplefinBusy || !simplefinConnected}
                />
                Include pending transactions (if supported)
              </label>
              <button
                type="button"
                className="neo-btn pink"
                disabled={simplefinBusy || !user || !simplefinConnected}
                onClick={handleSimplefinSync}
                style={{ justifyContent: 'center' }}
              >
                <RefreshCw size={16} /> {simplefinBusy ? 'Syncing...' : 'Sync from SimpleFIN'}
              </button>

              <button
                type="button"
                className="neo-btn white"
                disabled={!user}
                onClick={() => setShowSimplefinAccounts(v => !v)}
              >
                {showSimplefinAccounts ? 'Hide' : 'Show'} SimpleFIN Account Types
              </button>

              {showSimplefinAccounts && (
                <div className="neo-box" style={{ background: 'white', border: '3px solid black' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <strong>Account Mapping</strong>
                    <button type="button" className="neo-btn" onClick={handleApplyAccountMap} style={{ background: '#00F0FF' }}>
                      Apply Mapping to Existing
                    </button>
                  </div>
                  <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                    SimpleFIN doesn’t provide “account type” reliably, so we map each account to cash/debt/asset/ignore. Debt accounts turn charges into “debt-charge” and payments into “debt-payment”.
                  </p>

                  {simplefinAccounts.length === 0 ? (
                    <div style={{ opacity: 0.7, fontWeight: 700 }}>No SimpleFIN accounts detected yet. Run a sync first.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      {simplefinAccounts.map(a => {
                        const entry = simplefinAccountMap[a.id] || { kind: 'cash' as const };
                        const bal = a.balance;
                        const balDate = typeof a.balanceDate === 'number' ? new Date(a.balanceDate * 1000).toISOString().slice(0, 10) : null;
                        const linkedDebt = entry.kind === 'debt' && entry.debtAccountId ? debtComputed.get(entry.debtAccountId) : null;
                        const linkedAsset = entry.kind === 'asset' && entry.assetAccountId ? assetComputed.get(entry.assetAccountId) : null;
                        return (
                          <div key={a.id} style={{ border: '2px solid black', padding: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <div style={{ fontWeight: 900 }}>{a.name}</div>
                              <span className="badge">{a.id}</span>
                            </div>
                            <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.85, display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                              <span><b>Reported balance:</b> {typeof bal === 'string' ? bal : '—'}</span>
                              <span><b>As-of:</b> {balDate || '—'}</span>
                            </div>
                            {(linkedDebt || linkedAsset) && (
                              <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.9, display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {linkedDebt && (
                                  <>
                                    <span><b>Estimated current (from history):</b> ${linkedDebt.current.toFixed(2)}</span>
                                    <span><b>Interest (30d):</b> ${linkedDebt.interest30.toFixed(2)}</span>
                                    <span><b>Est APR:</b> {linkedDebt.aprPct == null ? '—' : `${linkedDebt.aprPct.toFixed(1)}%`}</span>
                                  </>
                                )}
                                {linkedAsset && (
                                  <span><b>Estimated current (from history):</b> ${linkedAsset.current.toFixed(2)}</span>
                                )}
                              </div>
                            )}

                            <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
                              <label style={{ fontWeight: 900, fontSize: '0.8rem' }}>Type</label>
                              <NeoSelect
                                className="neo-select"
                                value={entry.kind}
                                onChange={(v) => updateMapEntry(a.id, { kind: v as 'cash' | 'debt' | 'asset' | 'ignore' })}
                                options={[
                                  { value: 'cash', label: 'Cash (Checking/Income/Expenses)' },
                                  { value: 'debt', label: 'Debt (Credit Card / Loan)' },
                                  { value: 'asset', label: 'Asset (Savings/Investment)' },
                                  { value: 'ignore', label: 'Ignore' },
                                ]}
                              />

                              {entry.kind === 'debt' && (
                                <>
                                  <label style={{ fontWeight: 900, fontSize: '0.8rem' }}>Link to Debt Account</label>
                                  <NeoSelect
                                    className="neo-select"
                                    value={entry.debtAccountId || ''}
                                    onChange={(v) => updateMapEntry(a.id, { debtAccountId: v })}
                                    options={[
                                      { value: '', label: '-- Pick one --' },
                                      ...debts.map(d => ({ value: d.id, label: d.name })),
                                    ]}
                                  />
                                  {entry.debtAccountId && (
                                    <button
                                      type="button"
                                      className="neo-btn white"
                                      onClick={() => applyStartingBalanceFromSimplefin('debt', entry.debtAccountId || '', bal, a.name)}
                                    >
                                      Set Debt Starting Balance from SimpleFIN
                                    </button>
                                  )}
                                  <button type="button" className="neo-btn white" onClick={() => createAndLinkDebt(a.id, a.name)}>
                                    Create Debt Account
                                  </button>
                                </>
                              )}

                              {entry.kind === 'asset' && (
                                <>
                                  <label style={{ fontWeight: 900, fontSize: '0.8rem' }}>Link to Asset Account</label>
                                  <NeoSelect
                                    className="neo-select"
                                    value={entry.assetAccountId || ''}
                                    onChange={(v) => updateMapEntry(a.id, { assetAccountId: v })}
                                    options={[
                                      { value: '', label: '-- Pick one --' },
                                      ...assets.map(a2 => ({ value: a2.id, label: a2.name })),
                                    ]}
                                  />
                                  {entry.assetAccountId && (
                                    <button
                                      type="button"
                                      className="neo-btn white"
                                      onClick={() => applyStartingBalanceFromSimplefin('asset', entry.assetAccountId || '', bal, a.name)}
                                    >
                                      Set Asset Starting Balance from SimpleFIN
                                    </button>
                                  )}
                                  <button type="button" className="neo-btn white" onClick={() => createAndLinkAsset(a.id, a.name)}>
                                    Create Asset Account
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

