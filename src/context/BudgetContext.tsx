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

export interface CategoryBudget {
  category: string;
  limit: number;
}

interface BudgetContextType {
  transactions: Transaction[];
  user: User | null;
  categoryBudgets: Record<string, number>;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  editTransaction: (id: string, updated: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  setCategoryBudget: (category: string, limit: number) => void;
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

  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('budget_limits');
    return saved ? JSON.parse(saved) : {};
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
          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              password: user.key,
              transactions,
              // We should probably sync budgets too, but keeping it simple for now or adding it to the payload
              // For this iteration, let's just stick to transactions in the main sync payload unless we update the backend.
              // Ideally we update backend to accept arbitrary data, but let's just piggyback budget limits into a transaction? 
              // No, let's just sync transactions for now as requested by "autosync on new entries".
            })
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

  useEffect(() => {
    localStorage.setItem('budget_limits', JSON.stringify(categoryBudgets));
  }, [categoryBudgets]);

  const addTransaction = (t: Omit<Transaction, 'id'>) => {
    const newTransaction = { ...t, id: crypto.randomUUID() };
    setTransactions(prev => [...prev, newTransaction]);
  };

  const editTransaction = (id: string, updated: Omit<Transaction, 'id'>) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...updated, id } : t));
  };

  const deleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const setCategoryBudget = (category: string, limit: number) => {
    setCategoryBudgets(prev => ({ ...prev, [category]: limit }));
  };

  const clearAll = () => {
    setTransactions([]);
    setCategoryBudgets({});
  };

  const importCSV = (file: File): Promise<void> => {
    return new Promise((resolve, reject) => {
      // First, we need to check if it's the specific "Quick Fix" format or a generic one.
      // The Quick Fix format has headers on line 1: ,Date of Transaction,Description,Category,Income,Debits,Balance...
      // but "Date of Transaction" is column 2 (index 1).
      // Standard PapaParse with header:true might fail if the first column is empty or header is offset.

      Papa.parse(file, {
        header: false, // Parse as array of arrays first to inspect structure
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const rows = results.data as string[][];
            if (!rows || rows.length === 0) {
              reject("Empty CSV");
              return;
            }

            const parsed: Transaction[] = [];

            // Extract Budgets from CSV if possible?
            // The CSV has "Contribution Target" and "Budget Target" columns.
            // Let's try to parse them.
            const newBudgets: Record<string, number> = {};

            // Check for "Quick Fix" format
            // Look for a row that contains "Date of Transaction"
            const headerRowIndex = rows.findIndex(r => r.includes("Date of Transaction"));

            if (headerRowIndex !== -1) {
              // Quick Fix Format
              const header = rows[headerRowIndex];
              const dateIdx = header.indexOf("Date of Transaction");
              const descIdx = header.indexOf("Description");
              const catIdx = header.indexOf("Category"); // Note: In CSV it looks like "Category"
              const incomeIdx = header.findIndex(h => h.trim() === "Income");
              const debitIdx = header.findIndex(h => h.trim() === "Debits");

              // Also look for Budget Targets (often in a separate table side-by-side or scattered)
              // In your file, rows 12-27 cols K, L, M seem to be budget info: "Rent & Utilities", "$ 33.90", "$ 40.00"
              // Let's SCAN the whole sheet for the "Expenses" / "Budget Target" block.
              const budgetHeaderRow = rows.findIndex(r => r.includes("Budget Target"));
              if (budgetHeaderRow !== -1) {
                const bHeader = rows[budgetHeaderRow];
                const catColIdx = bHeader.indexOf("Expenses"); // "Expenses" column usually holds category names in this budget block
                const targetColIdx = bHeader.indexOf("Budget Target");

                if (catColIdx !== -1 && targetColIdx !== -1) {
                  for (let i = budgetHeaderRow + 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r[catColIdx]) continue;
                    const catName = r[catColIdx];
                    const targetValStr = r[targetColIdx];
                    if (catName && targetValStr) {
                      const val = parseFloat(targetValStr.replace(/[$,]/g, ''));
                      if (!isNaN(val) && val > 0) {
                        newBudgets[catName] = val;
                      }
                    }
                  }
                }
              }

              // Iterate rows after header for transactions
              for (let i = headerRowIndex + 1; i < rows.length; i++) {
                const row = rows[i];
                // Must have a date
                if (!row[dateIdx]) continue;

                const dateStr = row[dateIdx];
                // Parse Date: 11/1/2025 or 11/1 (assume current year if missing)
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
                // Clean category if needed
                if (!category) category = 'Uncategorized';

                // Determine Amount and Type
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
                  // Heuristic for Debt based on keywords? Or just expense default
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
              // FALLBACK
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
            if (Object.keys(newBudgets).length > 0) {
              setCategoryBudgets(prev => ({ ...prev, ...newBudgets }));
            }
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
    <BudgetContext.Provider value={{ transactions, user, categoryBudgets, addTransaction, editTransaction, deleteTransaction, setCategoryBudget, importCSV, clearAll, syncToCloud, loadFromCloud, logout, isSyncing }}>
      {children}
    </BudgetContext.Provider>
  );
};
