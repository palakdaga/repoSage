'use client';

import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/ChatInterface';
import { Suspense } from 'react';

function ChatPageContent() {
  const searchParams = useSearchParams();
  const repositoryId = searchParams.get('repositoryId') || '';
  const sessionId = searchParams.get('sessionId') || `session_${Date.now()}`;
  const repoUrl = searchParams.get('repoUrl') || undefined;
  const repoName = searchParams.get('repoName') || 'Repository';

  if (!repositoryId) {
    return (
      <div className="ag-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="glass-card-dark fade-in" style={{ padding: '40px', textAlign: 'center', maxWidth: '500px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>💬</div>
          <h2 style={{ color: 'white', fontSize: '1.3rem', marginBottom: '12px' }}>No Repository Selected</h2>
          <p style={{ color: '#636e72', fontSize: '0.9rem', marginBottom: '24px' }}>
            Please open chat from a repository analysis page.
          </p>
          <a href="/" className="glow-btn" style={{ textDecoration: 'none', display: 'inline-block' }}>
            ← Go to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="ag-bg" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Compact header */}
      <div style={{
        padding: '12px 24px',
        borderBottom: '1px solid rgba(108, 92, 231, 0.2)',
        background: 'rgba(15, 15, 26, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="/" style={{
            color: '#636e72', textDecoration: 'none', fontSize: '0.85rem',
            padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
            transition: 'all 0.2s',
          }}>
            ← Home
          </a>
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: '1.1rem' }}>💬</span>
          <span className="gradient-text" style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            RepoSage Chat
          </span>
          <span style={{
            color: '#636e72', fontSize: '0.85rem', padding: '4px 10px',
            borderRadius: '8px', background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            {repoName}
          </span>
        </div>
        {repoUrl && (
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#a29bfe', textDecoration: 'none', fontSize: '0.8rem',
              padding: '6px 12px', borderRadius: '8px',
              border: '1px solid rgba(108, 92, 231, 0.3)',
              transition: 'all 0.2s',
            }}
          >
            View on GitHub ↗
          </a>
        )}
      </div>

      {/* Full-height chat */}
      <div style={{ flex: 1, padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatInterface
            repositoryId={repositoryId}
            sessionId={sessionId}
            repoUrl={repoUrl}
          />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="ag-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="ag-spinner" />
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}
