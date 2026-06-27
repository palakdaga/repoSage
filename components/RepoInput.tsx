'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RepoInput() {
  const [repoUrl, setRepoUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;
    
    setIsLoading(true);
    setError('');
    
    // Navigate directly to results page, which triggers analysis
    router.push(`/results?url=${encodeURIComponent(repoUrl)}`);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <label htmlFor="repo-url" style={{ color: '#b2bec3', fontSize: '0.85rem', fontWeight: 500 }}>
        GitHub Repository URL
      </label>
      <input
        type="url"
        id="repo-url"
        value={repoUrl}
        onChange={(e) => { setRepoUrl(e.target.value); setError(''); }}
        placeholder="https://github.com/user/repository"
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '14px 18px',
          borderRadius: '12px',
          border: '1px solid rgba(108, 92, 231, 0.3)',
          background: 'rgba(255, 255, 255, 0.05)',
          color: 'white',
          fontSize: '1rem',
          outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = '#6c5ce7';
          e.target.style.boxShadow = '0 0 0 3px rgba(108, 92, 231, 0.15)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(108, 92, 231, 0.3)';
          e.target.style.boxShadow = 'none';
        }}
      />

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(255, 107, 107, 0.1)', border: '1px solid rgba(255, 107, 107, 0.3)',
          color: '#ff6b6b', fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!repoUrl.trim() || isLoading}
        className="glow-btn"
        style={{ width: '100%', fontSize: '1rem', padding: '16px' }}
      >
        {isLoading ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <span className="ag-spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }} />
            Launching Agents...
          </span>
        ) : (
          '🚀 Analyze with RepoSage'
        )}
      </button>

      <p style={{ color: '#636e72', fontSize: '0.75rem', textAlign: 'center', margin: 0 }}>
        Public and private repositories supported · Powered by 8 AI agents
      </p>
    </form>
  );
}