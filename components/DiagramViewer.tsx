'use client';

import { useState, useEffect, useRef } from 'react';

interface DiagramViewerProps {
  diagrams: Array<{
    id: string;
    title: string;
    type: string;
    mermaidCode: string;
  }>;
}

export function DiagramViewer({ diagrams }: DiagramViewerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [rendered, setRendered] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load mermaid dynamically
    const loadMermaid = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            primaryColor: '#6c5ce7',
            primaryTextColor: '#fff',
            lineColor: '#a29bfe',
            secondaryColor: '#00cec9',
            tertiaryColor: '#1a1a2e',
          },
        });

        const newRendered: Record<string, string> = {};
        for (const diagram of diagrams) {
          try {
            const { svg } = await mermaid.render(`mermaid-${diagram.id}`, diagram.mermaidCode);
            newRendered[diagram.id] = svg;
          } catch {
            newRendered[diagram.id] = '';
          }
        }
        setRendered(newRendered);
      } catch {
        // Mermaid not available — show raw code
      }
    };

    if (diagrams.length > 0) {
      loadMermaid();
    }
  }, [diagrams]);

  if (diagrams.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: '#636e72' }}>
        No diagrams generated yet.
      </div>
    );
  }

  const activeDiagram = diagrams[activeIndex];
  const typeIcons: Record<string, string> = {
    architecture: '🏗️',
    dependency: '🔗',
    component: '🧩',
    flow: '🔄',
    class: '📐',
  };

  return (
    <div>
      {/* Diagram tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {diagrams.map((d, i) => (
          <button
            key={d.id}
            onClick={() => setActiveIndex(i)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              background: i === activeIndex ? 'var(--ag-primary)' : 'rgba(255,255,255,0.08)',
              color: i === activeIndex ? 'white' : '#b2bec3',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            {typeIcons[d.type] || '📊'} {d.title}
          </button>
        ))}
      </div>

      {/* Diagram display */}
      <div
        ref={containerRef}
        style={{
          background: '#1a1a2e',
          borderRadius: '12px',
          padding: '24px',
          border: '1px solid rgba(108, 92, 231, 0.2)',
          minHeight: '300px',
          overflow: 'auto',
        }}
      >
        {rendered[activeDiagram.id] ? (
          <div
            dangerouslySetInnerHTML={{ __html: rendered[activeDiagram.id] }}
            style={{ display: 'flex', justifyContent: 'center' }}
          />
        ) : (
          <pre style={{ color: '#a29bfe', fontSize: '0.85rem', whiteSpace: 'pre-wrap', margin: 0 }}>
            {activeDiagram.mermaidCode}
          </pre>
        )}
      </div>
    </div>
  );
}
