'use client';

import { useState, useMemo } from 'react';

interface ProjectMetric {
  category: string;
  name: string;
  value: string | number;
  targetValue?: string | number;
  status: string;
  description: string;
  groqInsight?: string;
}

function calculateHealthScore(metrics: ProjectMetric[]): number {
  if (metrics.length === 0) return 0;
  const statusScores: Record<string, number> = { excellent: 100, good: 75, warning: 40, critical: 10 };
  const total = metrics.reduce((sum, m) => sum + (statusScores[m.status] || 50), 0);
  return Math.round(total / metrics.length);
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#00b894';
  if (score >= 60) return '#00cec9';
  if (score >= 40) return '#fdcb6e';
  return '#ff6b6b';
}

function getScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  if (score >= 30) return 'Needs Work';
  return 'Critical';
}

const statusColors: Record<string, string> = {
  excellent: '#00b894',
  good: '#00cec9',
  warning: '#fdcb6e',
  critical: '#ff6b6b',
};

const statusIcons: Record<string, string> = {
  excellent: '✓',
  good: '→',
  warning: '!',
  critical: '✕',
};

function parseTargetNum(val: string | number | undefined): number | null {
  if (val === undefined) return null;
  const s = String(val).replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseValueNum(val: string | number): number | null {
  const s = String(val).replace(/[^0-9.]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function MetricsPanel({ metrics }: { metrics: ProjectMetric[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = useMemo(
    () => [...new Set(metrics.map(m => m.category))],
    [metrics]
  );

  const filtered = useMemo(
    () => selectedCategory === 'all' ? metrics : metrics.filter(m => m.category === selectedCategory),
    [metrics, selectedCategory]
  );

  const statusCounts = useMemo(() => ({
    excellent: metrics.filter(m => m.status === 'excellent').length,
    good: metrics.filter(m => m.status === 'good').length,
    warning: metrics.filter(m => m.status === 'warning').length,
    critical: metrics.filter(m => m.status === 'critical').length,
  }), [metrics]);

  const healthScore = useMemo(() => calculateHealthScore(metrics), [metrics]);
  const hColor = getScoreColor(healthScore);

  // Short label for categories in filter buttons
  const shortLabel = (cat: string): string => {
    if (cat.includes('Quality')) return 'Quality';
    if (cat.includes('Dependencies')) return 'Dependencies';
    if (cat.includes('CI/CD')) return 'CI/CD';
    if (cat.includes('Documentation')) return 'Docs';
    if (cat.includes('Modern')) return 'Modern';
    if (cat.includes('Community')) return 'Community';
    if (cat.includes('Project')) return 'Project';
    if (cat.includes('Team')) return 'Process';
    if (cat.includes('Business')) return 'Business';
    if (cat.includes('Performance')) return 'Performance';
    return cat.split(' ')[0];
  };

  return (
    <div>
      {/* Health Score Dashboard */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(108,92,231,0.15), rgba(0,206,201,0.15))',
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
            border: `4px solid ${hColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.2)',
            flexDirection: 'column',
          }}>
            <div style={{ color: hColor, fontSize: '1.8rem', fontWeight: 800, lineHeight: 1 }}>{healthScore}</div>
            <div style={{ color: '#636e72', fontSize: '0.6rem' }}>/ 100</div>
          </div>
          <div style={{ color: hColor, fontSize: '0.8rem', fontWeight: 600, marginTop: '6px' }}>
            {getScoreLabel(healthScore)}
          </div>
        </div>

        {/* Status distribution */}
        <div style={{ flex: 1 }}>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', margin: '0 0 12px 0' }}>📊 Project Health Score</h3>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {[
              { key: 'excellent', icon: '✅', label: 'Excellent' },
              { key: 'good', icon: '✔️', label: 'Good' },
              { key: 'warning', icon: '⚠️', label: 'Warning' },
              { key: 'critical', icon: '❌', label: 'Critical' },
            ].map(({ key, icon, label }) => (
              <div key={key} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: statusColors[key] }}>
                  {statusCounts[key as keyof typeof statusCounts]}
                </div>
                <div style={{ color: '#636e72', fontSize: '0.7rem' }}>{icon} {label}</div>
              </div>
            ))}
          </div>
          {/* Status bar */}
          <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginTop: '12px', background: 'rgba(255,255,255,0.05)' }}>
            {['excellent', 'good', 'warning', 'critical'].map(key => {
              const count = statusCounts[key as keyof typeof statusCounts];
              if (count === 0) return null;
              return <div key={key} style={{ width: `${(count / metrics.length) * 100}%`, background: statusColors[key] }} />;
            })}
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setSelectedCategory('all')}
          style={{
            padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
            background: selectedCategory === 'all' ? '#6c5ce7' : 'rgba(255,255,255,0.08)',
            color: selectedCategory === 'all' ? 'white' : '#b2bec3', fontSize: '0.85rem', fontWeight: 500,
          }}
        >
          All ({metrics.length})
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            style={{
              padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
              background: selectedCategory === cat ? '#6c5ce7' : 'rgba(255,255,255,0.08)',
              color: selectedCategory === cat ? 'white' : '#b2bec3', fontSize: '0.85rem', fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            {shortLabel(cat)} ({metrics.filter(m => m.category === cat).length})
          </button>
        ))}
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '12px' }}>
        {filtered.map((metric, idx) => {
          const metricId = `${metric.category}:${metric.name}`;
          const color = statusColors[metric.status] || '#636e72';
          const icon = statusIcons[metric.status] || '?';

          // Calculate progress bar percentage
          const valNum = parseValueNum(metric.value);
          const targetNum = parseTargetNum(metric.targetValue);
          const showBar = valNum !== null && targetNum !== null && targetNum > 0;
          const barPercent = showBar ? Math.min(100, (valNum! / targetNum!) * 100) : 0;

          return (
            <div
              key={metricId}
              style={{
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '10px',
                border: `1px solid ${color}33`,
                borderLeft: `4px solid ${color}`,
                padding: '14px',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onClick={() => setExpandedId(expandedId === `${idx}` ? null : `${idx}`)}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '22px', height: '22px', borderRadius: '50%',
                    background: color, color: '#0f0f1a', fontWeight: 700, fontSize: '0.8rem',
                  }}>
                    {icon}
                  </span>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
                    {metric.name}
                  </span>
                </div>
                <span style={{ color: '#a29bfe', fontSize: '0.8rem' }}>
                  {expandedId === `${idx}` ? '▼' : '▶'}
                </span>
              </div>

              {/* Value and target */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ color: color, fontSize: '0.95rem', fontWeight: 700 }}>
                  {metric.value}
                </span>
                {metric.targetValue && (
                  <span style={{ color: '#636e72', fontSize: '0.75rem' }}>
                    Target: {metric.targetValue}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {showBar && (
                <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)', marginBottom: '4px' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    background: color,
                    width: `${barPercent}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              )}

              {/* Expandable Details */}
              {expandedId === `${idx}` && (
                <div style={{
                  marginTop: '12px', paddingTop: '12px',
                  borderTop: '1px solid rgba(108,92,231,0.2)',
                }}>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ color: color, fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}>
                      📌 What This Means
                    </div>
                    <p style={{ color: '#b2bec3', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                      {metric.description}
                    </p>
                  </div>

                  {metric.groqInsight && (
                    <div style={{
                      background: 'rgba(0,206,201,0.1)', padding: '10px', borderRadius: '8px',
                      borderLeft: '3px solid #00cec9',
                    }}>
                      <div style={{
                        color: '#00cec9', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}>
                        💡 AI Insight
                      </div>
                      <p style={{ color: '#00ff88', fontSize: '0.8rem', margin: 0, lineHeight: 1.5 }}>
                        {metric.groqInsight}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
