import React, { useRef, useState } from 'react';
import Papa from 'papaparse';
import { BudgetProvider, useBudget } from './context/BudgetContext';
import { SummaryCards } from './components/SummaryCards';
import { AddTransactionForm } from './components/AddTransactionForm';
import { BudgetCharts } from './components/BudgetCharts';
import { TransactionList } from './components/TransactionList';
import { Upload, Download, Trash } from 'lucide-react';

const Dashboard: React.FC = () => {
  const { transactions, importCSV, clearAll } = useBudget();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  const filteredTransactions = transactions.filter(t => t.date.startsWith(currentMonth));

  const handleExport = () => {
    const csv = Papa.unparse(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'budget_data.csv');
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
      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>NEO<span style={{ color: 'var(--neo-pink)' }}>BUDGET</span></h1>
          <p style={{ fontWeight: 'bold' }}>Own your money. Destroy debt.</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input
            type="month"
            className="neo-input"
            style={{ width: 'auto' }}
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
          />

          <button className="neo-btn secondary" onClick={handleExport}>
            <Download size={18} /> Save CSV
          </button>

          <button className="neo-btn accent" onClick={handleImportClick}>
            <Upload size={18} /> Load CSV
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".csv"
            onChange={handleFileChange}
          />

          <button className="neo-btn" style={{ background: '#FF4444', color: 'white' }} onClick={() => {
            if (confirm("Nuke all data?")) clearAll();
          }}>
            <Trash size={18} />
          </button>
        </div>
      </header>

      <SummaryCards transactions={filteredTransactions} />

      <BudgetCharts transactions={filteredTransactions} />

      <AddTransactionForm />

      <TransactionList transactions={filteredTransactions} />
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
