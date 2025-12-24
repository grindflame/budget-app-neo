import React, { useMemo } from 'react';
import type { Transaction } from '../context/BudgetContext';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { subMonths, format, parseISO } from 'date-fns';

interface BudgetChartsProps {
    transactions: Transaction[];
    currentMonth: string; // YYYY-MM used for rolling calc context
}

export const BudgetCharts: React.FC<BudgetChartsProps> = ({ transactions, currentMonth }) => {
    // 1. Calculate 3-Month Rolling Average Income
    const rollingAvgIncome = useMemo(() => {
        const today = parseISO(currentMonth + '-01');
        let totalIncome = 0;
        const monthsToCount = 3;

        for (let i = 0; i < monthsToCount; i++) {
            const d = subMonths(today, i);
            const yyyy_mm = format(d, 'yyyy-MM');
            const monthIncome = transactions
                .filter(t => t.date.startsWith(yyyy_mm) && t.type === 'income')
                .reduce((sum, t) => sum + t.amount, 0);
            totalIncome += monthIncome;
        }
        return totalIncome / monthsToCount;
    }, [transactions, currentMonth]);


    // 2. 6-Month Trends Data
    const trendData = useMemo(() => {
        const data = [];
        const today = parseISO(currentMonth + '-01');
        // Last 6 months range
        for (let i = 5; i >= 0; i--) {
            const d = subMonths(today, i);
            const yyyy_mm = format(d, 'yyyy-MM');
            const monthLabel = format(d, 'MMM');

            const monthIncome = transactions
                .filter(t => t.date.startsWith(yyyy_mm) && t.type === 'income')
                .reduce((sum, t) => sum + t.amount, 0);

            // Net = Income - Expenses - Debt
            const monthOut = transactions
                .filter(t => t.date.startsWith(yyyy_mm) && t.type !== 'income')
                .reduce((sum, t) => sum + t.amount, 0);

            data.push({
                name: monthLabel,
                Income: monthIncome,
                Out: monthOut
            });
        }
        return data;
    }, [transactions, currentMonth]);

    return (
        <div className="charts-grid">
            {/* Rolling Average Box */}
            <div className="neo-box" style={{ background: 'var(--neo-cyan)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{
                        background: 'white',
                        border: '3px solid black',
                        padding: '0.5rem',
                        display: 'flex'
                    }}>
                        <TrendingUp size={32} color="black" />
                    </div>
                    <h3 style={{ fontSize: '1.2rem', margin: 0 }}>3-MONTH ROLLING AVG INCOME</h3>
                </div>
                <div style={{ fontSize: '3rem', fontWeight: 900 }}>
                    ${rollingAvgIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p style={{ fontWeight: 'bold', opacity: 0.7, marginTop: '0.5rem' }}>
                    Based on {format(parseISO(currentMonth + '-01'), 'MMMM')} and previous 2 months
                </p>
            </div>

            {/* 6-Month Trend Chart */}
            <div className="neo-box" style={{ gridColumn: 'span 2' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>6-MONTH TRENDS</h3>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart data={trendData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" vertical={false} />
                            <XAxis dataKey="name" stroke="#000" tick={{ fill: 'black', fontWeight: 'bold', fontSize: '14px' }} axisLine={{ strokeWidth: 3 }} tickLine={{ strokeWidth: 2 }} />
                            <YAxis stroke="#000" tick={{ fill: 'black', fontWeight: 'bold', fontSize: '14px' }} axisLine={{ strokeWidth: 3 }} tickLine={{ strokeWidth: 2 }} />
                            <Tooltip
                                cursor={{ fill: '#eee' }}
                                contentStyle={{
                                    border: '3px solid black',
                                    borderRadius: '0px',
                                    boxShadow: '4px 4px 0px #000',
                                    fontWeight: 'bold'
                                }}
                            />
                            <Bar dataKey="Income" fill="var(--neo-green)" stroke="#000" strokeWidth={3} />
                            <Bar dataKey="Out" fill="var(--neo-pink)" stroke="#000" strokeWidth={3} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <style>{`
        .charts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        @media (min-width: 1000px) {
            .charts-grid {
                grid-template-columns: 1fr 2fr; /* 1/3 for Avg, 2/3 for Chart */
            }
        }
      `}</style>
        </div>
    );
};
