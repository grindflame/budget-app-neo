import React, { useEffect, useState } from 'react';
import { X, KeyRound, ShieldCheck, Link2, RefreshCw, Unlink2 } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ open, onClose }) => {
  const { user, updatePassword, saveOpenRouterKey, simplefinStatus, simplefinClaim, simplefinDisconnect, simplefinSync } = useBudget();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState(user?.openRouterKey || '');
  const [saving, setSaving] = useState(false);
  const [simplefinToken, setSimplefinToken] = useState('');
  const [simplefinConnected, setSimplefinConnected] = useState<boolean>(false);
  const [simplefinDaysBack, setSimplefinDaysBack] = useState<number>(60);
  const [simplefinIncludePending, setSimplefinIncludePending] = useState<boolean>(false);
  const [simplefinBusy, setSimplefinBusy] = useState<boolean>(false);

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
              <label style={{ fontWeight: 900, fontSize: '0.8rem' }}>Sync Range (days back, max 360)</label>
              <input
                type="number"
                className="neo-input"
                min={1}
                max={360}
                value={simplefinDaysBack}
                onChange={e => setSimplefinDaysBack(Math.max(1, Math.min(360, Number(e.target.value) || 60)))}
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

