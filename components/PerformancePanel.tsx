'use client';

import { useState, useMemo } from 'react';

interface PerformanceIssue {
  id: string;
  severity: string;
  title: string;
  description: string;
  filePath: string;
  lineNumber?: number;
  category: string;
  suggestion: string;
  groqOptimization?: string;
  detailedExplanation?: string;
  impact?: string;
  stepBySolution?: string[];
  codeExample?: string;
}

function calculatePerformanceScore(issues: PerformanceIssue[]): number {
  if (issues.length === 0) return 100;
  const penalties: Record<string, number> = { critical: 20, high: 12, medium: 6, low: 2 };
  const totalPenalty = issues.reduce((sum, i) => sum + (penalties[i.severity] || 0), 0);
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
  if (score >= 25) return 'Sluggish';
  return 'Critical';
}

export function PerformancePanel({ issues }: { issues: PerformanceIssue[] }) {
  const [filter, setFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => filter === 'all' ? issues : issues.filter(i => i.severity === filter),
    [issues, filter]
  );

  const categories = useMemo(
    () => [...new Set(issues.map(i => i.category))],
    [issues]
  );

  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    issues.forEach(i => { breakdown[i.category] = (breakdown[i.category] || 0) + 1; });
    return Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  }, [issues]);

  const score = useMemo(() => calculatePerformanceScore(issues), [issues]);
  const scoreColor = getScoreColor(score);

  const counts = useMemo(() => ({
    critical: issues.filter(i => i.severity === 'critical').length,
    high: issues.filter(i => i.severity === 'high').length,
    medium: issues.filter(i => i.severity === 'medium').length,
    low: issues.filter(i => i.severity === 'low').length,
  }), [issues]);

  if (issues.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <span style={{ fontSize: '3rem' }}>⚡</span>
        <h3 style={{ color: '#00b894', marginTop: '12px', fontSize: '1.2rem' }}>No Performance Issues Found</h3>
        <p style={{ color: '#636e72' }}>The codebase looks optimized. Performance score: 100/100</p>
      </div>
    );
  }

  return (
    <div>
      {/* Performance Score Dashboard */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(85,239,196,0.1), rgba(108,92,231,0.1))',
        borderRadius: '14px',
        padding: '24px',
        marginBottom: '20px',
        border: '1px solid rgba(85,239,196,0.2)',
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

        {/* Severity summary */}
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', margin: '0 0 12px 0' }}>⚡ Performance Score</h3>
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
        </div>

        {/* Category breakdown */}
        <div style={{ minWidth: '180px' }}>
          <div style={{ color: '#636e72', fontSize: '0.75rem', marginBottom: '8px', fontWeight: 600 }}>By Category</div>
          {categoryBreakdown.slice(0, 4).map(([cat, count]) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.05)' }}>
                <div style={{
                  height: '100%', borderRadius: '2px', background: '#55efc4',
                  width: `${(count / issues.length) * 100}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ color: '#b2bec3', fontSize: '0.68rem', minWidth: '80px' }}>{cat} ({count})</span>
            </div>
          ))}
        </div>
      </div>

      {/* Filter buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')}
          style={{ padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            background: filter === 'all' ? '#6c5ce7' : 'rgba(255,255,255,0.08)', color: filter === 'all' ? 'white' : '#b2bec3' }}>
          All ({issues.length})
        </button>
        {['critical', 'high', 'medium', 'low'].map(sev => {
          const count = counts[sev as keyof typeof counts];
          if (count === 0) return null;
          return (
            <button key={sev} onClick={() => setFilter(sev)} className={`badge severity-${sev}`}
              style={{ cursor: 'pointer', padding: '6px 14px', borderRadius: '20px', border: 'none', opacity: filter === sev ? 1 : 0.7 }}>
              {sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Issues list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '900px', overflow: 'auto' }}>
        {filtered.map(issue => (
          <div key={issue.id} style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '10px',
            padding: '14px',
            borderLeft: `3px solid ${
              issue.severity === 'critical' ? '#ff6b6b' :
              issue.severity === 'high' ? '#ffa502' :
              issue.severity === 'medium' ? '#fdcb6e' : '#a29bfe'
            }`,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
          onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span className={`badge severity-${issue.severity}`}>{issue.severity}</span>
              <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>{issue.title}</span>
              <span style={{ color: '#636e72', fontSize: '0.75rem', marginLeft: 'auto' }}>{issue.category}</span>
              <span style={{ color: '#55efc4', fontSize: '0.9rem' }}>{expandedId === issue.id ? '▼' : '▶'}</span>
            </div>
            <p style={{ color: '#b2bec3', fontSize: '0.85rem', margin: '4px 0' }}>{issue.description}</p>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', color: '#636e72', marginTop: '6px' }}>
              <span>📁 {issue.filePath}</span>
              {issue.lineNumber && <span>Line {issue.lineNumber}</span>}
            </div>

            {/* Expandable section */}
            {expandedId === issue.id && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(108,92,231,0.2)' }}>

                {/* Code that triggered this issue */}
                {issue.codeExample && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#55efc4', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      📋 Flagged Code
                    </div>
                    <pre style={{
                      background: 'rgba(0,0,0,0.4)',
                      padding: '10px',
                      borderRadius: '6px',
                      color: '#fdcb6e',
                      fontSize: '0.75rem',
                      overflow: 'auto',
                      margin: 0,
                      borderLeft: '3px solid #fdcb6e',
                    }}>
                      {issue.codeExample}
                    </pre>
                  </div>
                )}

                {/* Detailed Explanation */}
                {issue.detailedExplanation && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#fdcb6e', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      🔍 Why It&apos;s a Performance Problem
                    </div>
                    <p style={{ color: '#b2bec3', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                      {issue.detailedExplanation}
                    </p>
                  </div>
                )}

                {/* Performance Impact */}
                {issue.impact && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#ff6b6b', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      📉 Performance Impact
                    </div>
                    <p style={{ color: '#ff8787', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                      {issue.impact}
                    </p>
                  </div>
                )}

                {/* Step by Step Optimization */}
                {issue.stepBySolution && issue.stepBySolution.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: '#00b894', fontSize: '0.75rem', fontWeight: 600, marginBottom: '6px' }}>
                      ✅ Optimization Steps
                    </div>
                    <ol style={{ color: '#00d4aa', fontSize: '0.8rem', margin: 0, paddingLeft: '18px', lineHeight: 1.6 }}>
                      {issue.stepBySolution.map((step, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Basic suggestion */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ color: '#55efc4', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                    🔧 Suggestion
                  </div>
                  <p style={{ color: '#b2bec3', fontSize: '0.8rem', margin: 0 }}>
                    {issue.suggestion}
                  </p>
                </div>

                {/* AI-powered optimization */}
                {issue.groqOptimization && (
                  <div style={{ background: 'rgba(85, 239, 196, 0.1)', padding: '10px', borderRadius: '8px', borderLeft: '3px solid #55efc4' }}>
                    <div style={{ color: '#55efc4', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      🚀 AI Performance Boost
                    </div>
                    <p style={{ color: '#00ff88', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                      {issue.groqOptimization}
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
