import React, { useMemo, useState } from 'react';
import { X, Sparkles, Download, FileUp, CheckCircle2 } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import type { ImportedTransaction, TransactionType } from '../context/BudgetContext';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  categories: string[];
}

const AVAILABLE_MODELS = [
  { value: '', label: 'Auto (CSV: gpt-4o-mini, PDF: gpt-4o)' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (Fast, Cheap)' },
  { value: 'openai/gpt-4o', label: 'GPT-4o (Better for PDFs)' },
  { value: 'openai/gpt-4o-2024-11-20', label: 'GPT-4o (Nov 2024)' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku (Fast)' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

export const ImportModal: React.FC<ImportModalProps> = ({ open, onClose, categories }) => {
  const { aiImportStatements, addTransaction } = useBudget();
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<ImportedTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const catOptions = useMemo(() => {
    const uniq = new Set<string>(categories || []);
    uniq.add('Uncategorized');
    return Array.from(uniq);
  }, [categories]);

  if (!open) return null;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const list = Array.from(e.target.files);
    setFiles(prev => [...prev, ...list]);
  };

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
  };

  const runImport = async () => {
    setLoading(true);
    setError(null);
    setInfo(null);
    setRawResponse(null);
    setPreview([]);
    try {
      const result = await aiImportStatements(files, catOptions, selectedModel || undefined);
      setPreview(result.transactions || []);
      if (result.raw) {
        setRawResponse(typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw, null, 2));
      }
      if (result.message) setInfo(result.message);
      if (!result.transactions || result.transactions.length === 0) {
        setInfo("No transactions returned. Try a different model or file.");
        setShowRaw(true); // Auto-show raw response if no transactions
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const finalizeImport = () => {
    if (!preview.length) return;
    preview.forEach(p => {
      const safeAmount = Number(p.amount) || 0;
      if (!safeAmount) return;
      addTransaction({
        date: p.date || new Date().toISOString().split('T')[0],
        description: p.description || 'Imported',
        amount: safeAmount,
        type: (p.type as TransactionType) || 'expense',
        category: p.category || 'Uncategorized',
        debtAccountId: p.debtAccountId,
        assetAccountId: p.assetAccountId,
        recurringId: p.recurringId
      });
    });
    setPreview([]);
    setFiles([]);
    onClose();
    alert(`Imported ${preview.length} transactions`);
  };

  const updatePreview = (index: number, field: keyof ImportedTransaction, value: string | number) => {
    setPreview(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(preview, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-preview.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="neo-box" style={{ width: '96%', maxWidth: '1100px', background: 'var(--neo-white)', position: 'relative', maxHeight: '90vh', overflow: 'hidden' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <X size={22} />
        </button>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Sparkles color="black" />
          <h3 style={{ margin: 0 }}>AI STATEMENT IMPORT (PDF or CSV)</h3>
        </div>
        <p style={{ marginTop: '0.25rem', opacity: 0.8 }}>Uploads stay local; parsing runs through your OpenRouter key.</p>

        <div style={{ border: '3px dashed black', padding: '1rem', marginTop: '1rem', background: '#f7f7f7', display: 'grid', gap: '0.75rem' }}>
          <label style={{ fontWeight: 900 }}>1) Choose statements (PDF or CSV)</label>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="file" accept=".pdf,.csv" multiple onChange={onFileChange} />
            <FileUp size={18} />
            <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>We send minimal content to the model; keep files under 12MB.</span>
          </div>
          {files.length > 0 && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {files.map(f => (
                <span key={f.name} className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  {f.name}
                  <button onClick={() => removeFile(f.name)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'red' }}>×</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 900, minWidth: '120px' }}>2) Model:</label>
            <select 
              className="neo-select" 
              value={selectedModel} 
              onChange={e => setSelectedModel(e.target.value)}
              style={{ flex: '1', minWidth: '300px' }}
            >
              {AVAILABLE_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <button className="neo-btn pink" onClick={runImport} disabled={loading || files.length === 0} style={{ width: '200px', justifyContent: 'center' }}>
            {loading ? 'Processing...' : 'Run Import'}
          </button>
          {error && <div style={{ color: 'red', fontWeight: 900 }}>{error}</div>}
          {info && <div style={{ color: 'black', fontWeight: 700 }}>{info}</div>}
          {rawResponse && (
            <div style={{ marginTop: '0.5rem' }}>
              <button 
                onClick={() => setShowRaw(!showRaw)} 
                className="neo-btn white" 
                style={{ fontSize: '0.85rem', padding: '0.5rem' }}
              >
                {showRaw ? 'Hide' : 'Show'} Raw Response
              </button>
              {showRaw && (
                <pre style={{ 
                  marginTop: '0.5rem', 
                  padding: '1rem', 
                  background: '#f0f0f0', 
                  border: '2px solid black',
                  overflow: 'auto',
                  maxHeight: '300px',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace'
                }}>
                  {rawResponse}
                </pre>
              )}
            </div>
          )}
        </div>

        {preview.length > 0 && (
          <div style={{ marginTop: '1rem', maxHeight: '50vh', overflow: 'auto', borderTop: '4px solid black', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong>Review & Edit ({preview.length})</strong>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="neo-btn white" onClick={downloadJson}><Download size={16} /> JSON</button>
                <button className="neo-btn" style={{ background: '#00F0FF' }} onClick={finalizeImport}>
                  <CheckCircle2 size={16} /> Finalize Import
                </button>
              </div>
            </div>
            <div className="table-responsive">
              <table className="neo-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, idx) => (
                    <tr key={idx}>
                      <td><input className="edit-input" type="date" value={p.date || ''} onChange={e => updatePreview(idx, 'date', e.target.value)} /></td>
                      <td><input className="edit-input" value={p.description || ''} onChange={e => updatePreview(idx, 'description', e.target.value)} /></td>
                      <td><input className="edit-input" type="number" value={p.amount ?? 0} onChange={e => updatePreview(idx, 'amount', parseFloat(e.target.value))} /></td>
                      <td>
                        <select className="edit-input" value={p.type || 'expense'} onChange={e => updatePreview(idx, 'type', e.target.value)}>
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                          <option value="debt-payment">Debt Payment</option>
                          <option value="debt-interest">Debt Interest</option>
                          <option value="asset-deposit">Asset Deposit</option>
                          <option value="asset-growth">Asset Growth</option>
                        </select>
                      </td>
                      <td>
                        <select className="edit-input" value={p.category || 'Uncategorized'} onChange={e => updatePreview(idx, 'category', e.target.value)}>
                          {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                      <td>{p.source || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

