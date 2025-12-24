import React from 'react';
import type { Transaction } from '../context/BudgetContext';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

interface BudgetChartsProps {
    transactions: Transaction[];
}

const COLORS = ['#FF90E8', '#23F0C7', '#F9F871', '#00F0FF', '#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF'];

export const BudgetCharts: React.FC<BudgetChartsProps> = ({ transactions }) => {
    // Aggregate by category
    const categoryDataRaw = transactions
        .filter(t => t.type === 'expense')
        .reduce((acc: Record<string, { name: string, value: number }>, t) => {
            if (!acc[t.category]) acc[t.category] = { name: t.category, value: 0 };
            acc[t.category].value += t.amount;
            return acc;
        }, {});

    const categoryData = Object.values(categoryDataRaw);

    // Simple Cashflow data (Income vs Out (Expense + Debt))
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const out = transactions.filter(t => t.type !== 'income').reduce((acc, t) => acc + t.amount, 0);
    const flowData = [
        { name: 'In', amount: income },
        { name: 'Out', amount: out }
    ];

    return (
        <div className="charts-container">
            <div className="neo-box">
                <h3>Category Breakdown</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={categoryData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {categoryData.map((_entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="#000" strokeWidth={2} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    border: '3px solid black',
                                    borderRadius: '0px',
                                    boxShadow: '4px 4px 0px #000'
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="neo-box">
                <h3>Cash Flow</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart data={flowData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
                            <XAxis dataKey="name" stroke="#000" tick={{ fill: 'black', fontWeight: 'bold' }} />
                            <YAxis stroke="#000" tick={{ fill: 'black', fontWeight: 'bold' }} />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{
                                    border: '3px solid black',
                                    borderRadius: '0px',
                                    boxShadow: '4px 4px 0px #000'
                                }}
                            />
                            <Bar dataKey="amount" fill="#23F0C7" stroke="#000" strokeWidth={3} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <style>{`
        .charts-container {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
      `}</style>
        </div>
    );
};
