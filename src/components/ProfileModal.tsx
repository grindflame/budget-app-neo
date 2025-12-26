import React, { useState } from 'react';
import { X, KeyRound, ShieldCheck } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ open, onClose }) => {
  const { user, updatePassword, saveOpenRouterKey } = useBudget();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [openRouterKey, setOpenRouterKey] = useState(user?.openRouterKey || '');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="neo-box" style={{ width: '95%', maxWidth: '520px', background: 'var(--neo-white)', position: 'relative' }}>
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
        </div>
      </div>
    </div>
  );
};

