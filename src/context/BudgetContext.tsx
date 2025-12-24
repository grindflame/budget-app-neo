import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';

export type TransactionType = 'income' | 'expense' | 'debt';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
}

interface User {
  email: string;
  key: string;
}

interface BudgetContextType {
  transactions: Transaction[];
  user: User | null;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  importCSV: (file: File) => Promise<void>;
  clearAll: () => void;
  syncToCloud: (email: string, pw: string) => Promise<boolean>;
  loadFromCloud: (email: string, pw: string) => Promise<boolean>;
  logout: () => void;
  isSyncing: boolean;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export const useBudget = () => {
  const context = useContext(BudgetContext);
  if (!context) {
    throw new Error('useBudget must be used within a BudgetProvider');
  }
  return context;
};

export const BudgetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('budget_transactions');
    return saved ? JSON.parse(saved) : [];
  });

  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('budget_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem('budget_transactions', JSON.stringify(transactions));

    // Auto-sync logic
    if (user) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      setIsSyncing(true);
      syncTimeoutRef.current = setTimeout(async () => {
        try {
          // Call backend directly internal logic style, or reuse syncToCloud
          // Reuse syncToCloud but suppress alerts for auto-sync usually
          // Here we essentially re-implement a quiet sync
          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: user.key, transactions })
          });
          if (!res.ok) console.error("Auto-sync failed", await res.text());
        } catch (e) {
          console.error("Auto-sync error", e);
        } finally {
          setIsSyncing(false);
        }
      }, 2000); // 2 second debounce
    }
  }, [transactions, user]);

  const addTransaction = (t: Omit<Transaction, 'id'>) => {
    const newTransaction = { ...t, id: crypto.randomUUID() };
    setTransactions(prev => [...prev, newTransaction]);
  };

  const deleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const clearAll = () => setTransactions([]);

  const importCSV = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const rows = results.data as string[][];
            if (!rows || rows.length === 0) {
              reject("Empty CSV");
              return;
            }

            const parsed: Transaction[] = [];
            const headerRowIndex = rows.findIndex(r => r.includes("Date of Transaction"));

            if (headerRowIndex !== -1) {
              const header = rows[headerRowIndex];
              const dateIdx = header.indexOf("Date of Transaction");
              const descIdx = header.indexOf("Description");
              const catIdx = header.indexOf("Category");
              const incomeIdx = header.findIndex(h => h.trim() === "Income");
              const debitIdx = header.findIndex(h => h.trim() === "Debits");

              for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[dateIdx]) continue;

                const dateStr = row[dateIdx];
                let finalDate = new Date().toISOString().split('T')[0];
                try {
                  const parts = dateStr.split('/');
                  if (parts.length >= 2) {
                    const month = parts[0].padStart(2, '0');
                    const day = parts[1].padStart(2, '0');
                    let year = new Date().getFullYear().toString();
                    if (parts.length === 3) year = parts[2];
                    if (year.length === 2) year = '20' + year;
                    finalDate = `${year}-${month}-${day}`;
                  }
                } catch (e) { console.error("Date parse error", e); }

                const desc = row[descIdx];
                let category = row[catIdx];
                if (!category) category = 'Uncategorized';

                let amount = 0;
                let type: TransactionType = 'expense';

                const incomeVal = row[incomeIdx] ? parseFloat(row[incomeIdx].replace(/[$,]/g, '')) : 0;
                const debitVal = row[debitIdx] ? parseFloat(row[debitIdx].replace(/[$,]/g, '')) : 0;

                if (incomeVal > 0) {
                  amount = incomeVal;
                  type = 'income';
                } else if (debitVal > 0) {
                  amount = debitVal;
                  type = 'expense';
                  if (category.toLowerCase().includes('loan') || category.toLowerCase().includes('debt')) {
                    type = 'debt';
                  }
                }

                if (amount > 0) {
                  parsed.push({
                    id: crypto.randomUUID(),
                    date: finalDate,
                    description: desc || 'Imported',
                    amount,
                    type,
                    category
                  });
                }
              }

            } else {
              const header = rows[0].map(h => h.toLowerCase());
              const dIdx = header.findIndex(h => h.includes('date'));
              const descIdx = header.findIndex(h => h.includes('desc'));
              const amtIdx = header.findIndex(h => h.includes('amount'));
              const typeIdx = header.findIndex(h => h.includes('type'));
              const catIdx = header.findIndex(h => h.includes('cat'));

              if (dIdx !== -1 && amtIdx !== -1) {
                for (let i = 1; i < rows.length; i++) {
                  const row = rows[i];
                  if (!row[dIdx]) continue;

                  parsed.push({
                    id: crypto.randomUUID(),
                    date: row[dIdx] || new Date().toISOString().split('T')[0],
                    description: row[descIdx] || 'Imported',
                    amount: parseFloat(row[amtIdx].replace(/[$,]/g, '')) || 0,
                    type: (row[typeIdx]?.toLowerCase() as TransactionType) || 'expense',
                    category: row[catIdx] || 'Uncategorized'
                  });
                }
              }
            }

            setTransactions(prev => [...prev, ...parsed]);
            resolve();
          } catch (e) {
            console.error("CSV Import Error", e);
            reject(e);
          }
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  };

  const syncToCloud = async (email: string, pw: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw, transactions })
      });
      if (!res.ok) throw new Error(await res.text());

      // Save user session on success
      const newUser = { email, key: pw };
      setUser(newUser);
      localStorage.setItem('budget_user', JSON.stringify(newUser));
      return true;
    } catch (e) {
      alert("Sync failed: " + e);
      return false;
    }
  };

  const loadFromCloud = async (email: string, pw: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/sync?email=${encodeURIComponent(email)}&password=${encodeURIComponent(pw)}`);
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (data.transactions && Array.isArray(data.transactions)) {
        if (confirm(`Overwrite local data with ${data.transactions.length} transactions from cloud (Last Updated: ${data.lastUpdated})?`)) {
          setTransactions(data.transactions);

          // Save user session on success
          const newUser = { email, key: pw };
          setUser(newUser);
          localStorage.setItem('budget_user', JSON.stringify(newUser));
          return true;
        }
      }
      return false;
    } catch (e) {
      alert("Load failed: " + e);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('budget_user');
  };

  return (
    <BudgetContext.Provider value={{ transactions, user, addTransaction, deleteTransaction, importCSV, clearAll, syncToCloud, loadFromCloud, logout, isSyncing }}>
      {children}
    </BudgetContext.Provider>
  );
};
