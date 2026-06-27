'use client';

import { useState, useMemo } from 'react';

interface SecurityFinding {
  id: string;
  severity: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  category: string;
  recommendation: string;
  groqFix?: string;
  detailedExplanation?: string;
  impact?: string;
  stepBySolution?: string[];
  codeExample?: string;
}

function calculateSecurityScore(findings: SecurityFinding[]): number {
  if (findings.length === 0) return 100;
  const penalties: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 3, info: 1 };
  const totalPenalty = findings.reduce((sum, f) => sum + (penalties[f.severity] || 0), 0);
  return Math.max(0, Math.min(100, 100 - totalPenalty));
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#00b894';
  if (score >= 60) return '#fdcb6e';
  if (score >= 40) return '#ffa502';
  return '#ff6b6b';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Needs Work';
  if (score >= 25) return 'Poor';
  return 'Critical';
}

export function SecurityPanel({ findings }: { findings: SecurityFinding[] }) {
  const [filter, setFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filter === 'all' ? findings : findings.filter(f => f.severity === filter),
    [findings, filter]
  );

  const counts = useMemo(() => ({
    critical: findings.filter(f => f.severity === 'critical').length,
    high: findings.filter(f => f.severity === 'high').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
  }), [findings]);

  const categories = useMemo(
    () => [...new Set(findings.map(f => f.category))],
    [findings]
  );

  const score = useMemo(() => calculateSecurityScore(findings), [findings]);
  const scoreColor = getScoreColor(score);

  if (findings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <span style={{ fontSize: '3rem' }}>🛡️</span>
        <h3 style={{ color: '#00b894', marginTop: '12px', fontSize: '1.2rem' }}>No Security Issues Found</h3>
        <p style={{ color: '#636e72' }}>The codebase passed all security checks. Security score: 100/100</p>
      </div>
    );
  }

  return (
    <div>
      {/* Security Score Dashboard */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(108,92,231,0.15), rgba(0,206,201,0.1))',
        borderRadius: '14px',
        padding: '24px',
        marginBottom: '20px',
        border: '1px solid rgba(108,92,231,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        flexWrap: 'wrap',
      }}>
        {/* Score circle */}
        <div style={{ textAlign: 'center', minWidth: '100px' }}>
          <div style={{
            width: '90px', height: '90px', borderRadius: '50%',
            border: `4px solid ${scoreColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.2)',
            flexDirection: 'column',
          }}>
            <div style={{ color: scoreColor, fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{score}</div>
            <div style={{ color: '#636e72', fontSize: '0.6rem' }}>/ 100</div>
          </div>
          <div style={{ color: scoreColor, fontSize: '0.8rem', fontWeight: 600, marginTop: '6px' }}>
            {getScoreLabel(score)}
          </div>
        </div>

        {/* Severity breakdown */}
        <div style={{ flex: 1 }}>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', margin: '0 0 12px 0' }}>🔒 Security Score</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {[
              { sev: 'critical', color: '#ff6b6b', icon: '🔴' },
              { sev: 'high', color: '#ffa502', icon: '🟠' },
              { sev: 'medium', color: '#fdcb6e', icon: '🟡' },
              { sev: 'low', color: '#a29bfe', icon: '🔵' },
            ].map(({ sev, color, icon }) => (
              <div key={sev} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color }}>
                  {counts[sev as keyof typeof counts] || 0}
                </div>
                <div style={{ color: '#636e72', fontSize: '0.7rem' }}>{icon} {sev}</div>
              </div>
            ))}
          </div>
          {/* Severity bar */}
          <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginTop: '12px', background: 'rgba(255,255,255,0.05)' }}>
            {[
              { count: counts.critical, color: '#ff6b6b' },
              { count: counts.high, color: '#ffa502' },
              { count: counts.medium, color: '#fdcb6e' },
              { count: counts.low, color: '#a29bfe' },
            ].filter(s => s.count > 0).map((s, i) => (
              <div key={i} style={{ width: `${(s.count / findings.length) * 100}%`, background: s.color }} />
            ))}
          </div>
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', maxWidth: '250px' }}>
          {categories.map(cat => (
            <span key={cat} style={{
              padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem',
              background: 'rgba(108, 92, 231, 0.15)', color: '#a29bfe',
            }}>
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* Filter buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')}
          style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: '20px', border: 'none',
            background: filter === 'all' ? '#6c5ce7' : 'rgba(255,255,255,0.08)', color: filter === 'all' ? 'white' : '#b2bec3' }}>
          All ({findings.length})
        </button>
        {Object.entries(counts).filter(([,c]) => c > 0).map(([sev, count]) => (
          <button key={sev} onClick={() => setFilter(sev)} className={`badge severity-${sev}`}
            style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: '20px', border: 'none', opacity: filter === sev ? 1 : 0.7 }}>
            {sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
          </button>
        ))}
      </div>

      {/* Findings list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '900px', overflow: 'auto' }}>
        {filtered.map(finding => (
          <div key={finding.id} style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '10px',
            padding: '14px',
            borderLeft: `3px solid ${
              finding.severity === 'critical' ? '#ff6b6b' :
              finding.severity === 'high' ? '#ffa502' :
              finding.severity === 'medium' ? '#fdcb6e' :
              finding.severity === 'low' ? '#a29bfe' : '#74b9ff'
            }`,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
          onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className={`badge severity-${finding.severity}`}>{finding.severity}</span>
              <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{finding.title}</span>
              <span style={{ color: '#636e72', fontSize: '0.75rem', marginLeft: 'auto' }}>{finding.category}</span>
              <span style={{ color: '#a29bfe', fontSize: '0.9rem' }}>{expandedId === finding.id ? '▼' : '▶'}</span>
            </div>
            <p style={{ color: '#b2bec3', fontSize: '0.85rem', margin: '4px 0' }}>{finding.description}</p>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: '#636e72', marginTop: '6px' }}>
              <span>📁 {finding.filePath}</span>
              {finding.lineNumber && <span>Line {finding.lineNumber}</span>}
            </div>

            {/* Expandable section */}
            {expandedId === finding.id && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(108,92,231,0.2)' }}>

                {/* Code that triggered this finding */}
                {finding.codeExample && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#a29bfe', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      📋 Flagged Code
                    </div>
                    <pre style={{
                      background: 'rgba(0,0,0,0.4)',
                      padding: '10px',
                      borderRadius: '6px',
                      color: '#ff6b6b',
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      margin: 0,
                      borderLeft: '3px solid #ff6b6b',
                    }}>
                      {finding.codeExample}
                    </pre>
                  </div>
                )}

                {/* Detailed Explanation */}
                {finding.detailedExplanation && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#ff6b6b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      🔍 Why It&apos;s a Problem
                    </div>
                    <p style={{ color: '#b2bec3', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                      {finding.detailedExplanation}
                    </p>
                  </div>
                )}

                {/* Business Impact */}
                {finding.impact && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#ffa502', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      ⚠️ Business Impact
                    </div>
                    <p style={{ color: '#ffb366', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                      {finding.impact}
                    </p>
                  </div>
                )}

                {/* Step by Step Solution */}
                {finding.stepBySolution && finding.stepBySolution.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#00b894', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>
                      ✅ Step-by-Step Solution
                    </div>
                    <ol style={{ color: '#00d4aa', fontSize: '0.8rem', margin: 0, paddingLeft: '18px', lineHeight: 1.6 }}>
                      {finding.stepBySolution.map((step, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Basic recommendation */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: '#00cec9', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                    💡 Recommendation
                  </div>
                  <p style={{ color: '#b2bec3', fontSize: '0.8rem', margin: 0 }}>
                    {finding.recommendation}
                  </p>
                </div>

                {/* AI-powered fix */}
                {finding.groqFix && (
                  <div style={{ background: 'rgba(0, 206, 201, 0.1)', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #00cec9' }}>
                    <div style={{ color: '#00cec9', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      🤖 AI-Powered Fix
                    </div>
                    <p style={{ color: '#00f5ff', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                      {finding.groqFix}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
