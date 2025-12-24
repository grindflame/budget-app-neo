import React, { createContext, useContext, useState, useEffect } from 'react';
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

interface BudgetContextType {
  transactions: Transaction[];
  addTransaction: (t: Omit<Transaction, 'id'>) => void;
  deleteTransaction: (id: string) => void;
  importCSV: (file: File) => Promise<void>;
  clearAll: () => void;
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

  useEffect(() => {
    localStorage.setItem('budget_transactions', JSON.stringify(transactions));
  }, [transactions]);

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
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            // Assume CSV headers: Date, Description, Amount, Type, Category
            // or try to map loosely
            const parsed: Transaction[] = results.data.map((row: any) => ({
              id: crypto.randomUUID(),
              date: row.Date || new Date().toISOString().split('T')[0],
              description: row.Description || 'Imported Transaction',
              amount: parseFloat(row.Amount) || 0,
              type: (row.Type?.toLowerCase() as TransactionType) || 'expense',
              category: row.Category || 'Uncategorized'
            }));
            
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

  return (
    <BudgetContext.Provider value={{ transactions, addTransaction, deleteTransaction, importCSV, clearAll }}>
      {children}
    </BudgetContext.Provider>
  );
};
