'use client';

import { useState, useEffect } from 'react';

interface AgentInfo {
  agentId: string;
  agentName: string;
  status: string;
  progress: number;
  currentTask: string;
  error?: string;
}

interface CoordinatorStatus {
  overallProgress: number;
  currentPhase: string;
  agents: AgentInfo[];
}

export function AgentStatusPanel({ status }: { status: CoordinatorStatus | null }) {
  const [visible, setVisible] = useState(true);

  if (!status || !visible) return null;

  const agentIcons: Record<string, string> = {
    ingestion: '📥',
    understanding: '🧠',
    documentation: '📝',
    diagram: '📊',
    security: '🔒',
    performance: '⚡',
    refinement: '✨',
  };

  return (
    <div className="glass-card-dark p-6 fade-in" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
          🚀 RepoSage Pipeline
        </h3>
        <span style={{ color: '#a29bfe', fontSize: '0.85rem' }}>{status.currentPhase}</span>
      </div>

      {/* Overall progress */}
      <div className="ag-progress" style={{ marginBottom: '20px' }}>
        <div className="ag-progress-fill" style={{ width: `${status.overallProgress}%` }} />
      </div>
      <div style={{ textAlign: 'right', color: '#636e72', fontSize: '0.75rem', marginBottom: '16px' }}>
        {status.overallProgress}% complete
      </div>

      {/* Agent status grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
        {status.agents.map((agent) => (
          <div
            key={agent.agentId}
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '10px',
              padding: '12px',
              border: agent.status === 'processing' ? '1px solid rgba(0, 206, 201, 0.3)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className={`agent-dot ${agent.status}`} />
              <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 500 }}>
                {agentIcons[agent.agentId] || '🤖'} {agent.agentName}
              </span>
            </div>
            <div className="ag-progress" style={{ height: '4px' }}>
              <div className="ag-progress-fill" style={{ width: `${agent.progress}%` }} />
            </div>
            {agent.currentTask && (
              <p style={{ color: '#636e72', fontSize: '0.7rem', marginTop: '6px', margin: '6px 0 0 0' }}>
                {agent.currentTask}
              </p>
            )}
            {agent.error && (
              <p style={{ color: '#ff6b6b', fontSize: '0.7rem', marginTop: '4px', margin: '4px 0 0 0' }}>
                ⚠ {agent.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
