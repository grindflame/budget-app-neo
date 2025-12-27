/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import Papa from 'papaparse';

export type TransactionType = 'income' | 'expense' | 'debt-payment' | 'debt-interest' | 'asset-deposit' | 'asset-growth';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType | 'debt';
  category: string;
  debtAccountId?: string;
  assetAccountId?: string; // Link to Asset
  recurringId?: string; // If generated from a recurring rule
}

export interface DebtAccount {
  id: string;
  name: string;
  startingBalance: number;
}

export interface AssetAccount {
  id: string;
  name: string;
  startingBalance: number;
}

export interface RecurringRule {
  id: string;
  enabled: boolean;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  dayOfMonth: number; // 1-31
  startMonth: string; // YYYY-MM (inclusive)
  debtAccountId?: string;
  assetAccountId?: string;
}

interface User {
  email: string;
  key: string;
  openRouterKey?: string;
}

export interface CategoryBudget {
  category: string;
  limit: number;
}

interface BudgetContextType {
  transactions: Transaction[];
  debts: DebtAccount[];
  assets: AssetAccount[]; // New
  recurring: RecurringRule[];
  user: User | null;
  categoryBudgets: Record<string, number>;

  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  editTransaction: (id: string, updated: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;

  addDebt: (d: Omit<DebtAccount, 'id'>) => void;
  editDebt: (id: string, updated: Omit<DebtAccount, 'id'>) => void;
  deleteDebt: (id: string) => void;

  addAsset: (a: Omit<AssetAccount, 'id'>) => void; // New
  editAsset: (id: string, updated: Omit<AssetAccount, 'id'>) => void; // New
  deleteAsset: (id: string) => void; // New

  addRecurring: (r: Omit<RecurringRule, 'id'>) => void;
  editRecurring: (id: string, updated: Omit<RecurringRule, 'id'>) => void;
  deleteRecurring: (id: string) => void;
  toggleRecurring: (id: string, enabled: boolean) => void;
  generateRecurringForMonth: (yyyyMM: string) => void;

  setCategoryBudget: (category: string, limit: number) => void;
  importCSV: (file: File) => Promise<void>;
  clearAll: () => void;
  syncToCloud: (email: string, pw: string) => Promise<boolean>;
  loadFromCloud: (email: string, pw: string) => Promise<boolean>;
  logout: () => void;
  isSyncing: boolean;
  updatePassword: (currentPw: string, newPw: string) => Promise<boolean>;
  saveOpenRouterKey: (key: string) => Promise<boolean>;
  aiImportStatements: (files: File[], categoriesHint: string[], model?: string) => Promise<ImportResult>;

  simplefinStatus: () => Promise<boolean>;
  simplefinClaim: (setupTokenOrClaimUrl: string) => Promise<boolean>;
  simplefinDisconnect: () => Promise<boolean>;
  simplefinSync: (daysBack?: number, includePending?: boolean) => Promise<{ added: number; errors: string[] }>;
}

export interface ImportedTransaction extends Omit<Transaction, 'id'> {
  source?: string;
}

export interface ImportResult {
  transactions: ImportedTransaction[];
  message?: string;
  raw?: unknown;
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

  const [assets, setAssets] = useState<AssetAccount[]>(() => {
    const saved = localStorage.getItem('budget_assets');
    return saved ? JSON.parse(saved) : [];
  });

  const [recurring, setRecurring] = useState<RecurringRule[]>(() => {
    const saved = localStorage.getItem('budget_recurring');
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
    localStorage.setItem('budget_assets', JSON.stringify(assets));
    localStorage.setItem('budget_limits', JSON.stringify(categoryBudgets));
    localStorage.setItem('budget_recurring', JSON.stringify(recurring));

    // Auto-sync logic
    if (user) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

      setIsSyncing(true);
      syncTimeoutRef.current = setTimeout(async () => {
        try {
          const payload = {
            email: user.email,
            password: user.key,
            transactions,
            debts,
            assets, // Sync assets
            categoryBudgets,
            recurring
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
  }, [transactions, user, debts, assets, categoryBudgets, recurring]);

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
    setTransactions(prev => prev.map(t => t.debtAccountId === id ? { ...t, debtAccountId: undefined } : t));
    setRecurring(prev => prev.map(r => r.debtAccountId === id ? { ...r, debtAccountId: undefined } : r));
  };

  const addAsset = (a: Omit<AssetAccount, 'id'>) => {
    setAssets(prev => [...prev, { ...a, id: crypto.randomUUID() }]);
  };

  const editAsset = (id: string, updated: Omit<AssetAccount, 'id'>) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...updated, id } : a));
  };

  const deleteAsset = (id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));
    setTransactions(prev => prev.map(t => t.assetAccountId === id ? { ...t, assetAccountId: undefined } : t));
    setRecurring(prev => prev.map(r => r.assetAccountId === id ? { ...r, assetAccountId: undefined } : r));
  };

  const addRecurring = (r: Omit<RecurringRule, 'id'>) => {
    setRecurring(prev => [...prev, { ...r, id: crypto.randomUUID() }]);
  };

  const editRecurring = (id: string, updated: Omit<RecurringRule, 'id'>) => {
    setRecurring(prev => prev.map(r => r.id === id ? { ...updated, id } : r));
  };

  const deleteRecurring = (id: string) => {
    setRecurring(prev => prev.filter(r => r.id !== id));
  };

  const toggleRecurring = (id: string, enabled: boolean) => {
    setRecurring(prev => prev.map(r => r.id === id ? { ...r, enabled } : r));
  };

  const generateRecurringForMonth = (yyyyMM: string) => {
    // Ensure we only generate once per recurring rule per month
    const [yStr, mStr] = yyyyMM.split('-');
    const year = Number(yStr);
    const monthIndex = Number(mStr) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) return;

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    setTransactions(prev => {
      const alreadyExists = (ruleId: string) =>
        prev.some(t => t.recurringId === ruleId && t.date.startsWith(yyyyMM));

      const toAdd: Transaction[] = [];
      for (const rule of recurring) {
        if (!rule.enabled) continue;
        if (rule.startMonth && yyyyMM < rule.startMonth) continue;
        if (alreadyExists(rule.id)) continue;

        const day = Math.min(Math.max(1, rule.dayOfMonth), daysInMonth);
        const date = `${yyyyMM}-${String(day).padStart(2, '0')}`;

        toAdd.push({
          id: crypto.randomUUID(),
          date,
          description: rule.description,
          amount: rule.amount,
          type: rule.type,
          category: rule.category || 'Uncategorized',
          debtAccountId: rule.debtAccountId,
          assetAccountId: rule.assetAccountId,
          recurringId: rule.id
        });
      }

      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd];
    });
  };


  const setCategoryBudget = (category: string, limit: number) => {
    setCategoryBudgets(prev => ({ ...prev, [category]: limit }));
  };

  const clearAll = () => {
    setTransactions([]);
    setDebts([]);
    setAssets([]);
    setCategoryBudgets({});
    setRecurring([]);
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
        assets, // Sync
        categoryBudgets,
        recurring
      };
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());

      const newUser: User = { email, key: pw, openRouterKey: user?.openRouterKey };
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

      if (confirm(`Overwrite local data with Cloud Data? (Last Updated: ${data.lastUpdated})`)) {
        if (data.transactions) setTransactions(data.transactions);
        if (data.debts) setDebts(data.debts);
        if (data.assets) setAssets(data.assets);
        if (data.categoryBudgets) setCategoryBudgets(data.categoryBudgets);
        if (data.recurring) setRecurring(data.recurring);

        const newUser: User = { email, key: pw, openRouterKey: user?.openRouterKey };
        setUser(newUser);
        localStorage.setItem('budget_user', JSON.stringify(newUser));
        return true;
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

  const updatePassword = async (currentPw: string, newPw: string): Promise<boolean> => {
    if (!user) {
      alert("Please log in first.");
      return false;
    }
    if (!currentPw || !newPw) return false;
    try {
      const res = await fetch('/api/profile?action=change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          oldPassword: currentPw,
          newPassword: newPw
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: User = { ...user, key: newPw };
      setUser(updated);
      localStorage.setItem('budget_user', JSON.stringify(updated));
      alert("Password updated");
      return true;
    } catch (e) {
      alert("Update failed: " + e);
      return false;
    }
  };

  const saveOpenRouterKey = async (key: string): Promise<boolean> => {
    if (!user) {
      alert("Please log in first.");
      return false;
    }
    if (!key) return false;
    try {
      const res = await fetch('/api/profile?action=save-openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.key,
          openRouterKey: key
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const updated: User = { ...user, openRouterKey: key };
      setUser(updated);
      localStorage.setItem('budget_user', JSON.stringify(updated));
      alert("OpenRouter key saved");
      return true;
    } catch (e) {
      alert("Could not save key: " + e);
      return false;
    }
  };

  const simplefinStatus = async (): Promise<boolean> => {
    if (!user) {
      alert("Please log in first.");
      return false;
    }
    try {
      const res = await fetch(`/api/simplefin?action=status&email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(user.key)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { hasSimplefin?: boolean };
      return Boolean(data?.hasSimplefin);
    } catch (e) {
      alert("SimpleFIN status failed: " + e);
      return false;
    }
  };

  const simplefinClaim = async (setupTokenOrClaimUrl: string): Promise<boolean> => {
    if (!user) {
      alert("Please log in first.");
      return false;
    }
    if (!setupTokenOrClaimUrl.trim()) return false;
    try {
      const res = await fetch('/api/simplefin?action=claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.key,
          token: setupTokenOrClaimUrl.trim(),
        })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("SimpleFIN connected");
      return true;
    } catch (e) {
      alert("SimpleFIN connect failed: " + e);
      return false;
    }
  };

  const simplefinDisconnect = async (): Promise<boolean> => {
    if (!user) {
      alert("Please log in first.");
      return false;
    }
    try {
      const res = await fetch('/api/simplefin?action=disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.key,
        })
      });
      if (!res.ok) throw new Error(await res.text());
      alert("SimpleFIN disconnected");
      return true;
    } catch (e) {
      alert("SimpleFIN disconnect failed: " + e);
      return false;
    }
  };

  const simplefinSync = async (daysBack = 60, includePending = false): Promise<{ added: number; errors: string[] }> => {
    if (!user) {
      alert("Please log in first.");
      return { added: 0, errors: ["Not logged in"] };
    }
    try {
      const res = await fetch('/api/simplefin?action=sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.key,
          daysBack,
          includePending,
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { transactions?: ImportedTransaction[]; errors?: string[] };
      const incoming = Array.isArray(data.transactions) ? data.transactions : [];
      const errors = Array.isArray(data.errors) ? data.errors : [];

      const fingerprint = (t: { date: string; description: string; amount: number; type: string; category: string }) => {
        const amt = Number(t.amount) || 0;
        return `${t.date}|${String(t.type)}|${amt.toFixed(2)}|${(t.description || '').trim().toLowerCase()}|${(t.category || '').trim().toLowerCase()}`;
      };

      const existing = new Set(transactions.map(t => fingerprint({
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
        category: t.category
      })));

      const toAdd = incoming.filter(t => {
        const fp = fingerprint({
          date: t.date,
          description: t.description,
          amount: Number(t.amount) || 0,
          type: String(t.type || ''),
          category: t.category || 'Uncategorized'
        });
        if (existing.has(fp)) return false;
        existing.add(fp);
        return true;
      }).map(t => ({
        id: crypto.randomUUID(),
        date: t.date || new Date().toISOString().slice(0, 10),
        description: t.description || 'Imported',
        amount: Number(t.amount) || 0,
        type: (t.type as TransactionType) || 'expense',
        category: t.category || 'Uncategorized',
        debtAccountId: t.debtAccountId,
        assetAccountId: t.assetAccountId,
        recurringId: t.recurringId
      }));

      if (toAdd.length > 0) {
        setTransactions(prev => [...prev, ...toAdd]);
      }

      return { added: toAdd.length, errors };
    } catch (e) {
      alert("SimpleFIN sync failed: " + e);
      return { added: 0, errors: [String(e)] };
    }
  };

  const aiImportStatements = async (files: File[], categoriesHint: string[], model?: string): Promise<ImportResult> => {
    if (!user) throw new Error("Please log in first.");
    if (!files || files.length === 0) throw new Error("No files provided");

    const form = new FormData();
    form.append('email', user.email);
    form.append('password', user.key);
    if (user.openRouterKey) form.append('openRouterKey', user.openRouterKey);
    form.append('categories', JSON.stringify(categoriesHint || []));
    if (model) form.append('model', model);
    files.forEach(f => form.append('files', f));

    const res = await fetch('/api/import', {
      method: 'POST',
      body: form
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Import failed");
    }
    return res.json() as Promise<ImportResult>;
  };

  return (
    <BudgetContext.Provider value={{
      transactions,
      debts,
      assets,
      recurring,
      user,
      categoryBudgets,
      addTransaction,
      editTransaction,
      deleteTransaction,
      addDebt,
      editDebt,
      deleteDebt,
      addAsset,
      editAsset,
      deleteAsset,
      addRecurring,
      editRecurring,
      deleteRecurring,
      toggleRecurring,
      generateRecurringForMonth,
      setCategoryBudget,
      importCSV,
      clearAll,
      syncToCloud,
      loadFromCloud,
      logout,
      isSyncing,
      updatePassword,
      saveOpenRouterKey,
      aiImportStatements,
      simplefinStatus,
      simplefinClaim,
      simplefinDisconnect,
      simplefinSync
    }}>
      {children}
    </BudgetContext.Provider>
  );
};
