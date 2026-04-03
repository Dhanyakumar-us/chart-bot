import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import { MessageSquare, BarChart2, Settings } from 'lucide-react';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ 
        width: '260px', 
        backgroundColor: 'var(--bg-secondary)', 
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem'
      }}>
        <div style={{ 
          fontSize: '1.2rem', 
          fontWeight: 'bold', 
          marginBottom: '2rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <div style={{
            width: '24px', height: '24px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)'
          }}></div>
          NoLimits AI
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <button 
            onClick={() => setActiveTab('chat')}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem', borderRadius: '0.5rem',
              backgroundColor: activeTab === 'chat' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeTab === 'chat' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <MessageSquare size={18} />
            Chat
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.75rem 1rem', borderRadius: '0.5rem',
              backgroundColor: activeTab === 'analytics' ? 'var(--bg-tertiary)' : 'transparent',
              color: activeTab === 'analytics' ? 'var(--text-primary)' : 'var(--text-secondary)'
            }}
          >
            <BarChart2 size={18} />
            Analytics
          </button>
        </div>

        <div style={{
          padding: '1rem 0', borderTop: '1px solid var(--border-color)',
          display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)'
        }}>
          <Settings size={18} />
          Settings
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'chat' && <ChatInterface />}
        {activeTab === 'analytics' && <AnalyticsDashboard />}
      </div>
    </div>
  );
}

export default App;
