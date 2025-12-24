import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { BudgetProvider, useBudget } from './context/BudgetContext';
import { SummaryCards } from './components/SummaryCards';
import { AddTransactionForm } from './components/AddTransactionForm';
import { BudgetCharts } from './components/BudgetCharts';
import { TransactionList } from './components/TransactionList';
import { Upload, Download, Trash, ChevronLeft, ChevronRight, Wallet, Cloud, X, LogOut, RefreshCw } from 'lucide-react';
import { format, addMonths, subMonths, parseISO } from 'date-fns';

const SyncModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { syncToCloud, loadFromCloud } = useBudget();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    if (!email || !pw) return;
    setLoading(true);
    const success = await syncToCloud(email, pw);
    setLoading(false);
    if (success) {
      alert("Logged in & Data Synced!");
      onClose();
    }
  };

  const handleLoad = async () => {
    if (!email || !pw) return;
    setLoading(true);
    const success = await loadFromCloud(email, pw);
    setLoading(false);
    if (success) onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
    }}>
      <div className="neo-box" style={{ width: '90%', maxWidth: '400px', background: 'var(--neo-white)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3>CLOUD VAULT LOGIN</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
        </div>
        <p style={{ marginBottom: '1.5rem', fontWeight: 'bold' }}>To enable Auto-Sync, please log in with your credentials.</p>

        <input
          className="neo-input"
          placeholder="Email / Key"
          style={{ marginBottom: '1rem' }}
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          className="neo-input"
          type="password"
          placeholder="Password / Secret"
          style={{ marginBottom: '1rem' }}
          value={pw}
          onChange={e => setPw(e.target.value)}
        />

        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
          <button className="neo-btn" disabled={loading} onClick={handleLoad}>
            {loading ? '...' : 'LOAD & LOGIN'}
          </button>
          <button className="neo-btn pink" disabled={loading} onClick={handleSync}>
            {loading ? '...' : 'SAVE & LOGIN'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const { transactions, importCSV, clearAll, user, logout, isSyncing } = useBudget();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSync, setShowSync] = useState(false);

  // Use state for the selected month YYYY-MM
  const [currentMonth, setCurrentMonth] = useState(() => {
    return new Date().toISOString().slice(0, 7);
  });

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const date = parseISO(currentMonth + '-01');
    const newDate = direction === 'next' ? addMonths(date, 1) : subMonths(date, 1);
    setCurrentMonth(format(newDate, 'yyyy-MM'));
  };

  const handleExport = () => {
    const csv = Papa.unparse(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `budget_data_${currentMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await importCSV(e.target.files[0]);
    }
  };

  return (
    <div className="container">
      {showSync && <SyncModal onClose={() => setShowSync(false)} />}

      {/* HEADER SECTION */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon">
            <Wallet size={36} color="black" />
          </div>
          <h1>BRUTAL <span style={{ color: 'var(--neo-pink)' }}>BUDGET</span></h1>
        </div>

        <div className="actions-section">
          {user ? (
            <>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                fontWeight: 900,
                marginRight: '1rem',
                background: 'white',
                border: '3px solid black',
                padding: '0.5rem 1rem',
                boxShadow: '4px 4px 0 black'
              }}>
                <span>{user.email}</span>
                <button onClick={logout} className="neo-btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#eee' }} title="Logout">
                  <LogOut size={16} />
                </button>
                {isSyncing && <RefreshCw size={16} className="spin" />}
              </div>
            </>
          ) : (
            <button className="neo-btn" onClick={() => setShowSync(true)} style={{ background: '#00F0FF' }}>
              <Cloud size={20} strokeWidth={3} /> CLOUD LOGIN
            </button>
          )}

          <button className="neo-btn white" onClick={handleExport}>
            <Download size={20} strokeWidth={3} /> CSV
          </button>

          <button className="neo-btn white" onClick={handleImportClick}>
            <Upload size={20} strokeWidth={3} /> CSV
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".csv"
            onChange={handleFileChange}
          />
        </div>
      </header>

      {/* MONTH NAVIGATOR */}
      <div className="month-nav">
        <button className="neo-btn white icon-only" onClick={() => handleMonthChange('prev')}>
          <ChevronLeft size={28} strokeWidth={4} />
        </button>
        <h2>{format(parseISO(currentMonth + '-01'), 'MMMM yyyy')}</h2>
        <button className="neo-btn white icon-only" onClick={() => handleMonthChange('next')}>
          <ChevronRight size={28} strokeWidth={4} />
        </button>
      </div>

      {/* SUMMARY CARDS (Now includes Total Debts Button) */}
      <SummaryCards transactions={transactions} currentMonth={currentMonth} />

      <BudgetCharts transactions={transactions} currentMonth={currentMonth} />

      <div className="content-grid">
        <div className="form-section">
          <AddTransactionForm />
        </div>
        <div className="list-section">
          <TransactionList transactions={transactions.filter(t => t.date.startsWith(currentMonth))} />
        </div>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button className="neo-btn" style={{ background: '#FF4444', color: 'white' }} onClick={() => {
          if (confirm("ARE YOU SURE YOU WANT TO NUKE ALL DATA? THIS CANNOT BE UNDONE.")) clearAll();
        }}>
          <Trash size={20} /> NUKE ALL DATA
        </button>
      </div>

      <style>{`
        .app-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 2rem;
            border-bottom: 4px solid black;
            padding-bottom: 1rem;
        }
        .logo-section {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        .logo-icon {
            background: var(--neo-yellow);
            border: 4px solid black;
            box-shadow: 4px 4px 0 black;
            padding: 0.5rem;
            display: flex;
        }
        .logo-section h1 {
            font-size: 2.5rem;
            margin: 0;
            line-height: 1;
        }
        .actions-section {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-wrap: wrap;
        }
        
        .month-nav {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 2rem;
            margin-bottom: 3rem;
        }
        .month-nav h2 {
            font-size: 2rem;
            background: white;
            border: 4px solid black;
            padding: 0.5rem 1rem;
            box-shadow: 6px 6px 0 black;
            margin: 0;
            min-width: 300px;
            text-align: center;
        }
        .icon-only {
            padding: 0.5rem;
        }
        
        .content-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 2rem;
        }
        @media (min-width: 1000px) {
            .content-grid {
                grid-template-columns: 1fr 2fr;
            }
        }
        @keyframes spin {
             0% { transform: rotate(0deg); }
             100% { transform: rotate(360deg); }
        }
        .spin {
            animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

function App() {
  return (
    <BudgetProvider>
      <Dashboard />
    </BudgetProvider>
  );
}

export default App;
