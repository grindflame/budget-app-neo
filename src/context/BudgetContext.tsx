import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';

export type TransactionType = 'income' | 'expense' | 'debt-payment' | 'debt-interest';
// 'debt-payment' reduces linked debt. 'debt-interest' increases linked debt.
// Legacy 'debt' type will be migrated to 'debt-payment' if found, or kept for backward compat?
// Ideally we standardize. Let's support 'debt' as alias for 'debt-payment' for now to avoid breaking existing data.

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType | 'debt';
  category: string;
  debtAccountId?: string; // Optional link to a DebtAccount
}

export interface DebtAccount {
  id: string;
  name: string;
  startingBalance: number;
  // Current Balance is calculated: Starting - Payments + Interest
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
  debts: DebtAccount[];
  user: User | null;
  categoryBudgets: Record<string, number>;
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  editTransaction: (id: string, updated: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  addDebt: (d: Omit<DebtAccount, 'id'>) => void;
  editDebt: (id: string, updated: Omit<DebtAccount, 'id'>) => void;
  deleteDebt: (id: string) => void;
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

  const [debts, setDebts] = useState<DebtAccount[]>(() => {
    const saved = localStorage.getItem('budget_debts');
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
    localStorage.setItem('budget_debts', JSON.stringify(debts));
    localStorage.setItem('budget_limits', JSON.stringify(categoryBudgets));

    // Auto-sync logic
    if (user) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      setIsSyncing(true);
      syncTimeoutRef.current = setTimeout(async () => {
        try {
          // Determine full state to sync
          // Note: The backend currently expects { transactions }. We need to possibly payload more.
          // We'll stuff debts/budgets into specific "System" transactions or just update backend later?
          // Actually, for now, let's just stick to local persistence for Debts/Budgets unless we update backend schema.
          // WAIT -> The user explicitly asked for Cloud Sync.
          // The backend API `functions/api/sync.ts` takes arbitrary JSON body and stores it in KV.
          // So we can just change the payload structure! Env -> KV accepts JSON.
          // However, the types in `sync.ts` expect `transactions`.
          // Let's assume the backend saves whatever we send if we didn't type check strictly or if we update the call.
          // The `sync.ts` just does `const { ... transactions } = body`.
          // We need to update `sync.ts` to accept `debts` and `categoryBudgets` too.
          // But for this precise step, I can't edit `sync.ts` safely while defining Context.
          // Let's hope the backend is flexible or I will update `sync.ts` in next step.
          // Actually, I can send them as part of the body, and if `sync.ts` only extracts `transactions`, we lose data.
          // I MUST update `sync.ts`.
          const payload = {
            email: user.email,
            password: user.key,
            transactions,
            debts,
            categoryBudgets
          };

          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) console.error("Auto-sync failed", await res.text());
        } catch (e) {
          console.error("Auto-sync error", e);
        } finally {
          setIsSyncing(false);
        }
      }, 2000);
    }
  }, [transactions, user, debts, categoryBudgets]);

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

  const addDebt = (d: Omit<DebtAccount, 'id'>) => {
    setDebts(prev => [...prev, { ...d, id: crypto.randomUUID() }]);
  };

  const editDebt = (id: string, updated: Omit<DebtAccount, 'id'>) => {
    setDebts(prev => prev.map(d => d.id === id ? { ...updated, id } : d));
  };

  const deleteDebt = (id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
    // Also unlink transactions?
    setTransactions(prev => prev.map(t => t.debtAccountId === id ? { ...t, debtAccountId: undefined } : t));
  };

  const setCategoryBudget = (category: string, limit: number) => {
    setCategoryBudgets(prev => ({ ...prev, [category]: limit }));
  };

  const clearAll = () => {
    setTransactions([]);
    setDebts([]);
    setCategoryBudgets({});
  };

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
            const newBudgets: Record<string, number> = {};

            const headerRowIndex = rows.findIndex(r => r.includes("Date of Transaction"));
            const budgetHeaderRow = rows.findIndex(r => r.includes("Budget Target"));

            // Parse Budgets
            if (budgetHeaderRow !== -1) {
              const bHeader = rows[budgetHeaderRow];
              const catColIdx = bHeader.indexOf("Expenses");
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
                let type: TransactionType | 'debt' = 'expense';

                const incomeVal = row[incomeIdx] ? parseFloat(row[incomeIdx].replace(/[$,]/g, '')) : 0;
                const debitVal = row[debitIdx] ? parseFloat(row[debitIdx].replace(/[$,]/g, '')) : 0;

                if (incomeVal > 0) {
                  amount = incomeVal;
                  type = 'income';
                } else if (debitVal > 0) {
                  amount = debitVal;
                  type = 'expense';
                  if (category.toLowerCase().includes('loan') || category.toLowerCase().includes('debt')) {
                    // Map to debt-payment by default for now
                    type = 'debt-payment';
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
      const payload = {
        email,
        password: pw,
        transactions,
        debts,
        categoryBudgets
      };
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());

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
      // We accept data even if just transactions exist
      if (data.transactions || data.debts || data.categoryBudgets) {
        if (confirm(`Overwrite local data with Cloud Data?`)) {
          if (data.transactions) setTransactions(data.transactions);
          if (data.debts) setDebts(data.debts);
          if (data.categoryBudgets) setCategoryBudgets(data.categoryBudgets);

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
    <BudgetContext.Provider value={{ transactions, debts, user, categoryBudgets, addTransaction, editTransaction, deleteTransaction, addDebt, editDebt, deleteDebt, setCategoryBudget, importCSV, clearAll, syncToCloud, loadFromCloud, logout, isSyncing }}>
      {children}
    </BudgetContext.Provider>
  );
};
