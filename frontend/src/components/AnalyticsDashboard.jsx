import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Mon', focus: 4000, context: 2400 },
  { name: 'Tue', focus: 3000, context: 1398 },
  { name: 'Wed', focus: 2000, context: 9800 },
  { name: 'Thu', focus: 2780, context: 3908 },
  { name: 'Fri', focus: 1890, context: 4800 },
  { name: 'Sat', focus: 2390, context: 3800 },
  { name: 'Sun', focus: 3490, context: 4300 },
];

function AnalyticsDashboard() {
  return (
    <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Analytics & Focus Dashboard</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        Monitor your AI usage, context token windows, and system focus directly locally.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {['Total Prompts', 'Context Tokens Processed', 'Active Focus Time'].map((title, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '1.5rem', borderRadius: '0.75rem' }}>
            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{title}</h3>
            <p style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '0.5rem' }}>
               {idx === 0 ? '1,245' : idx === 1 ? '1.2M' : '42h 13m'}
            </p>
          </div>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '2rem', borderRadius: '0.75rem', height: '400px' }}>
        <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Weekly Focus Metric</h3>
        <ResponsiveContainer width="100%" height="80%">
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
            <XAxis dataKey="name" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip 
               contentStyle={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '0.5rem' }}
            />
            <Line type="monotone" dataKey="focus" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
            <Line type="monotone" dataKey="context" stroke="#10b981" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default AnalyticsDashboard;
