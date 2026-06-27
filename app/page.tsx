import { RepoInput } from "@/components/RepoInput";

export const metadata = {
  title: 'RepoSage — AI-Powered Repository Intelligence',
  description: 'Analyze any GitHub repository with 8 AI agents. Get architecture docs, security scans, performance insights, and interactive diagrams.',
};

export default function Home() {
  return (
    <div className="ag-bg">
      {/* Hero */}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Floating orbs */}
        <div className="float-slow" style={{
          position: 'absolute', top: '15%', left: '10%', width: '120px', height: '120px',
          background: 'radial-gradient(circle, rgba(108,92,231,0.15) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none',
        }} />
        <div className="float-medium" style={{
          position: 'absolute', top: '60%', right: '8%', width: '80px', height: '80px',
          background: 'radial-gradient(circle, rgba(0,206,201,0.12) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none',
        }} />
        <div className="float-fast" style={{
          position: 'absolute', bottom: '20%', left: '15%', width: '60px', height: '60px',
          background: 'radial-gradient(circle, rgba(162,155,254,0.1) 0%, transparent 70%)',
          borderRadius: '50%', pointerEvents: 'none',
        }} />

        {/* Logo + Title */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }} className="fade-in">
          <div style={{
            fontSize: '4rem', marginBottom: '8px',
            filter: 'drop-shadow(0 0 20px rgba(108, 92, 231, 0.4))',
          }}>
            🚀
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, letterSpacing: '-0.02em',
            marginBottom: '12px', lineHeight: 1.1,
          }}>
            <span className="gradient-text">RepoSage</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 300, fontSize: '0.5em', display: 'block', marginTop: '4px' }}>
              RepoSage
            </span>
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.6)', fontSize: '1.15rem', maxWidth: '500px', margin: '0 auto', lineHeight: 1.6,
          }}>
            AI-powered multi-agent repository analysis.
            <br />Security scans · Architecture docs · Performance insights.
          </p>
        </div>

        {/* Input card */}
        <div className="glass-card-dark fade-in" style={{
          padding: '32px', width: '100%', maxWidth: '560px',
        }}>
          <RepoInput />
        </div>

        {/* Agent badges */}
        <div className="fade-in" style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px',
          justifyContent: 'center', marginTop: '32px', maxWidth: '600px',
        }}>
          {[
            { icon: '📥', name: 'Ingestion' },
            { icon: '🧠', name: 'Understanding' },
            { icon: '📝', name: 'Documentation' },
            { icon: '📊', name: 'Diagrams' },
            { icon: '🔒', name: 'Security' },
            { icon: '⚡', name: 'Performance' },
            { icon: '✨', name: 'Refinement' },
            { icon: '🚀', name: 'Coordinator' },
          ].map(agent => (
            <div key={agent.name} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px', borderRadius: '20px',
              background: 'rgba(108, 92, 231, 0.12)',
              border: '1px solid rgba(108, 92, 231, 0.2)',
              color: '#a29bfe', fontSize: '0.8rem',
            }}>
              <span>{agent.icon}</span>
              <span>{agent.name}</span>
            </div>
          ))}
        </div>

        {/* Feature cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px', marginTop: '48px', maxWidth: '900px', width: '100%',
        }}>
          {[
            { icon: '🧠', title: 'AI Analysis', desc: 'Ollama-powered code understanding with RAG' },
            { icon: '📊', title: 'Auto Diagrams', desc: 'Architecture, dependency & flow diagrams' },
            { icon: '🔒', title: 'Security Scan', desc: 'Detect secrets, injections & vulnerabilities' },
            { icon: '⚡', title: 'Performance', desc: 'Find N+1 queries, sync I/O & bottlenecks' },
          ].map(feature => (
            <div key={feature.title} className="glass-card-dark" style={{
              padding: '24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>{feature.icon}</div>
              <h3 style={{ color: 'white', fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>
                {feature.title}
              </h3>
              <p style={{ color: '#636e72', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}