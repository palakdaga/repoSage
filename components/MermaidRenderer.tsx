'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MermaidValidator } from '@/lib/utils/MermaidValidator';

interface MermaidRendererProps {
  code: string;
  id: string;
  onError?: (error: string) => void;
}

let globalRenderCounter = 0;

export function MermaidRenderer({ code, id, onError }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const renderingRef = useRef(false);
  const renderIdRef = useRef<string>('');

  // Stable onError callback
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const renderDiagram = useCallback(async () => {
    // Prevent concurrent renders
    if (renderingRef.current) return;
    renderingRef.current = true;

    try {
      // Validate code is not empty
      if (!code || code.trim().length === 0) {
        setError('Diagram code is empty');
        renderingRef.current = false;
        return;
      }

      // Validate and fix diagram code
      const validation = MermaidValidator.validate(code);
      setWarnings(validation.warnings);

      const diagramCode = validation.fixed || code;

      // Generate a unique render ID to avoid Mermaid duplicate ID errors
      globalRenderCounter++;
      const renderId = `mermaid-${id}-${globalRenderCounter}`;
      renderIdRef.current = renderId;

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

      // Remove any previously rendered element with the same ID from the DOM
      const existingEl = document.getElementById(renderId);
      if (existingEl) existingEl.remove();

      if (!validation.isValid && validation.errors.length > 0) {
        // Try rendering anyway — mermaid.js may handle it better than our validator
        try {
          const { svg } = await mermaid.render(renderId, diagramCode);
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
            setError(null);
          }
        } catch {
          // Genuine failure — show fallback
          const fallbackId = `${renderId}-fb`;
          const existingFb = document.getElementById(fallbackId);
          if (existingFb) existingFb.remove();

          const fallback = MermaidValidator.generateFallback();
          try {
            const { svg } = await mermaid.render(fallbackId, fallback);
            if (containerRef.current) {
              containerRef.current.innerHTML = svg;
            }
          } catch {
            // Even fallback failed — just show the code
            if (containerRef.current) {
              containerRef.current.innerHTML = '';
            }
          }
          setError(`${validation.errors.join('; ')} — Showing fallback diagram`);
          onErrorRef.current?.(`Diagram syntax errors: ${validation.errors.join('; ')}`);
        }
        renderingRef.current = false;
        return;
      }

      // Happy path: validated code
      try {
        const { svg } = await mermaid.render(renderId, diagramCode);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      } catch (renderErr: any) {
        // mermaid.render threw — try with sanitised code one more time
        const cleanedCode = diagramCode
          .replace(/[<>]/g, '')
          .replace(/&(?!amp;|gt;|lt;|quot;)/g, 'and');

        const retryId = `${renderId}-retry`;
        const existingRetry = document.getElementById(retryId);
        if (existingRetry) existingRetry.remove();

        try {
          const { svg } = await mermaid.render(retryId, cleanedCode);
          if (containerRef.current) {
            containerRef.current.innerHTML = svg;
            setError(null);
            setWarnings((prev) => [...prev, 'Diagram had special characters that were cleaned for rendering']);
          }
        } catch {
          // Final fallback - show the raw code in a styled block
          if (containerRef.current) {
            containerRef.current.innerHTML = `<pre style="color:#a29bfe;font-size:0.8rem;white-space:pre-wrap;margin:0">${escapeHTML(diagramCode)}</pre>`;
          }
          const msg = renderErr?.message || String(renderErr) || 'Unknown error';
          setError(`Failed to render diagram: ${msg}`);
          onErrorRef.current?.(`Diagram render error: ${msg}`);
        }
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err) || 'Unknown error';
      // Show raw code as last resort
      if (containerRef.current) {
        containerRef.current.innerHTML = `<pre style="color:#a29bfe;font-size:0.8rem;white-space:pre-wrap;margin:0">${escapeHTML(code)}</pre>`;
      }
      setError(`Cannot render diagram: ${errorMsg}`);
      onErrorRef.current?.(`Diagram render error: ${errorMsg}`);
      console.error('Failed to render mermaid diagram:', { code, error: err });
    } finally {
      renderingRef.current = false;
    }
  }, [code, id]);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  return (
    <div style={{ marginTop: '8px' }}>
      <div
        ref={containerRef}
        style={{
          background: 'rgba(26, 26, 46, 0.5)',
          borderRadius: '10px',
          padding: '12px',
          border: error ? '1px solid rgba(255, 107, 107, 0.3)' : '1px solid rgba(108, 92, 231, 0.2)',
          overflowX: 'auto',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '150px',
        }}
      />
      {error && (
        <div style={{ marginTop: '8px' }}>
          <div
            style={{
              background: 'rgba(255, 107, 107, 0.1)',
              border: '1px solid rgba(255, 107, 107, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '8px',
            }}
          >
            <div style={{ color: '#ff6b6b', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 'bold' }}>
              ⚠️ {error}
            </div>
            <details style={{ cursor: 'pointer' }}>
              <summary style={{ color: '#a29bfe', fontSize: '0.8rem', marginBottom: '6px' }}>
                View original diagram code
              </summary>
              <pre
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  color: '#e2e8f0',
                  padding: '8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  overflow: 'auto',
                  maxHeight: '200px',
                  margin: '6px 0 0 0',
                }}
              >
                {code}
              </pre>
            </details>
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ marginTop: '6px' }}>
          <div
            style={{
              background: 'rgba(255, 193, 7, 0.1)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              borderRadius: '6px',
              padding: '8px',
            }}
          >
            <div style={{ color: '#ffc107', fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '4px' }}>
              💡 Validation Warnings
            </div>
            {warnings.map((warning, idx) => (
              <div key={idx} style={{ color: '#ffd54f', fontSize: '0.7rem', marginBottom: '2px' }}>
                • {warning}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
