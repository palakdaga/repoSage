'use client';

import { useState, useMemo } from 'react';

interface ArchitectureAnalysis {
  highlevelOverview?: {
    purpose?: string;
    problemSolved?: string;
    stakeholders?: string[];
    userWorkflow?: string;
  };
  architecturalPattern?: {
    pattern?: string;
    rationale?: string;
    alternatives?: string[];
  };
  repositoryStructure?: {
    directory?: string[];
    organization?: string;
    buildTools?: string[];
    monorepoExplanation?: string;
  };
  components?: { name: string; description: string; technology: string; responsibility: string }[];
  techStack?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
    infrastructure?: string[];
    messaging?: string[];
    other?: string[];
  };
  dataFlow?: {
    description?: string;
    flowDiagram?: string;
    apiProtocols?: string[];
    asyncProcessing?: string;
  };
  dataArchitecture?: {
    databaseType?: string;
    schema?: string;
    dataAccessPattern?: string;
    explanation?: string;
  };
  deployment?: {
    infrastructure?: string;
    containerization?: string;
    cicdPipeline?: string;
    deploymentSteps?: string[];
  };
  qualityAttributes?: {
    security?: string;
    scalability?: string;
    performance?: string;
    maintainability?: string;
    resilience?: string;
  };
  architectureDecisions?: {
    decision?: string;
    rationale?: string;
    alternatives?: string[];
    tradeoffs?: string;
  }[];
  diagramMermaid?: string;
}

export function ArchitecturePanel({ analysis }: { analysis: ArchitectureAnalysis }) {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [expandedAdr, setExpandedAdr] = useState<number | null>(null);

  // Normalize analysis data with defaults
  const normalized = {
    highlevelOverview: analysis.highlevelOverview || {},
    architecturalPattern: analysis.architecturalPattern || {},
    repositoryStructure: analysis.repositoryStructure || {},
    components: analysis.components || [],
    techStack: analysis.techStack || {},
    dataFlow: analysis.dataFlow || {},
    dataArchitecture: analysis.dataArchitecture || {},
    deployment: analysis.deployment || {},
    qualityAttributes: analysis.qualityAttributes || {},
    architectureDecisions: analysis.architectureDecisions || [],
    diagramMermaid: analysis.diagramMermaid || '',
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📋' },
    { id: 'pattern', label: 'Pattern', icon: '🏗️' },
    { id: 'components', label: 'Components', icon: '🧩' },
    { id: 'techstack', label: 'Tech Stack', icon: '⚙️' },
    { id: 'dataflow', label: 'Data Flow', icon: '📊' },
    { id: 'database', label: 'Database', icon: '🗄️' },
    { id: 'deployment', label: 'Deployment', icon: '🚀' },
    { id: 'quality', label: 'Quality', icon: '✨' },
    { id: 'decisions', label: 'Decisions', icon: '💡' },
  ];

  const renderSection = (title: string, content: React.ReactNode) => (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{ color: '#00cec9', fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
        {title}
      </h3>
      <div style={{ color: '#b2bec3', fontSize: '0.9rem', lineHeight: 1.6 }}>
        {content}
      </div>
    </div>
  );

  return (
    <div>
      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        gap: '4px',
        marginBottom: '20px',
        paddingBottom: '12px',
        borderBottom: '1px solid rgba(108,92,231,0.2)',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === tab.id ? '#6c5ce7' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#636e72',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '12px', padding: '20px' }}>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="fade-in">
            {renderSection('📌 Application Purpose', normalized.highlevelOverview.purpose)}
            {renderSection('🎯 Problem Solved', normalized.highlevelOverview.problemSolved)}
            {renderSection(
              '👥 Stakeholders',
              <ul style={{ margin: 0, paddingLeft: '24px' }}>
                {(normalized.highlevelOverview.stakeholders || []).map((s, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>{s}</li>
                ))}
              </ul>
            )}
            {renderSection('🔄 User Workflow', normalized.highlevelOverview.userWorkflow)}
          </div>
        )}

        {/* Pattern */}
        {activeTab === 'pattern' && (
          <div className="fade-in">
            {renderSection(
              `🏗️ Architecture: ${normalized.architecturalPattern.pattern || 'Not specified'}`,
              <div>
                <p>{normalized.architecturalPattern.rationale}</p>
                {(normalized.architecturalPattern.alternatives || []).length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <strong>Alternatives Considered:</strong>
                    <ul style={{ margin: '8px 0 0 24px', paddingLeft: 0 }}>
                      {(normalized.architecturalPattern.alternatives || []).map((alt, i) => (
                        <li key={i}>{alt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Components */}
        {activeTab === 'components' && (
          <div className="fade-in">
            <div style={{ display: 'grid', gap: '12px' }}>
              {normalized.components.map((comp, i) => (
                <div key={i} style={{
                  background: 'rgba(108,92,231,0.1)',
                  padding: '14px',
                  borderRadius: '10px',
                  borderLeft: '3px solid #6c5ce7',
                }}>
                  <div style={{ color: '#00cec9', fontWeight: 600, marginBottom: '4px' }}>
                    {comp.name}
                  </div>
                  <p style={{ color: '#b2bec3', fontSize: '0.85rem', margin: '4px 0' }}>
                    {comp.description}
                  </p>
                  <div style={{ fontSize: '0.8rem', color: '#636e72', marginTop: '8px' }}>
                    <div><strong>Tech:</strong> {comp.technology}</div>
                    <div><strong>Responsibility:</strong> {comp.responsibility}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tech Stack */}
        {activeTab === 'techstack' && (
          <div className="fade-in">
            {(normalized.techStack.frontend || []).length > 0 && renderSection(
              '💻 Frontend',
              (normalized.techStack.frontend || []).join(', ')
            )}
            {(normalized.techStack.backend || []).length > 0 && renderSection(
              '⚙️ Backend',
              (normalized.techStack.backend || []).join(', ')
            )}
            {(normalized.techStack.database || []).length > 0 && renderSection(
              '🗄️ Database',
              (normalized.techStack.database || []).join(', ')
            )}
            {(normalized.techStack.infrastructure || []).length > 0 && renderSection(
              '☁️ Infrastructure',
              (normalized.techStack.infrastructure || []).join(', ')
            )}
            {(normalized.techStack.messaging || []).length > 0 && renderSection(
              '📨 Messaging',
              (normalized.techStack.messaging || []).join(', ')
            )}
            {(normalized.techStack.other || []).length > 0 && renderSection(
              '🔧 Other',
              (normalized.techStack.other || []).join(', ')
            )}
          </div>
        )}

        {/* Data Flow */}
        {activeTab === 'dataflow' && (
          <div className="fade-in">
            {renderSection('📊 Data Flow Description', normalized.dataFlow.description)}
            {renderSection(
              '📡 API Protocols',
              (normalized.dataFlow.apiProtocols || []).join(', ')
            )}
            {renderSection(
              '⏱️ Asynchronous Processing',
              normalized.dataFlow.asyncProcessing
            )}
            {renderSection(
              '🔀 Architecture Diagram',
              <pre style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '12px',
                borderRadius: '8px',
                overflow: 'auto',
                color: '#a29bfe',
                fontSize: '0.75rem',
              }}>
                {normalized.diagramMermaid}
              </pre>
            )}
          </div>
        )}

        {/* Database */}
        {activeTab === 'database' && (
          <div className="fade-in">
            {renderSection('🗂️ Database Type', normalized.dataArchitecture.databaseType)}
            {renderSection('📋 Schema Design', normalized.dataArchitecture.schema)}
            {renderSection('🔌 Data Access Pattern', normalized.dataArchitecture.dataAccessPattern)}
            {renderSection('ℹ️ Explanation', normalized.dataArchitecture.explanation)}
          </div>
        )}

        {/* Deployment */}
        {activeTab === 'deployment' && (
          <div className="fade-in">
            {renderSection('☁️ Infrastructure', normalized.deployment.infrastructure)}
            {renderSection('🐳 Containerization', normalized.deployment.containerization)}
            {renderSection('🔄 CI/CD Pipeline', normalized.deployment.cicdPipeline)}
            {renderSection(
              '📦 Deployment Steps',
              <ol style={{ margin: 0, paddingLeft: '24px' }}>
                {(normalized.deployment.deploymentSteps || []).map((step, i) => (
                  <li key={i} style={{ marginBottom: '6px' }}>{step}</li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* Quality Attributes */}
        {activeTab === 'quality' && (
          <div className="fade-in">
            {renderSection(
              '🔐 Security',
              <div style={{ background: 'rgba(255,107,107,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #ff6b6b' }}>
                {normalized.qualityAttributes.security}
              </div>
            )}
            {renderSection(
              '📈 Scalability',
              <div style={{ background: 'rgba(0,187,148,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #00b894' }}>
                {normalized.qualityAttributes.scalability}
              </div>
            )}
            {renderSection(
              '⚡ Performance',
              <div style={{ background: 'rgba(250,202,110,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #faca6e' }}>
                {normalized.qualityAttributes.performance}
              </div>
            )}
            {renderSection(
              '🔧 Maintainability',
              <div style={{ background: 'rgba(108,92,231,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #6c5ce7' }}>
                {normalized.qualityAttributes.maintainability}
              </div>
            )}
            {renderSection(
              '🛡️ Resilience',
              <div style={{ background: 'rgba(0,206,201,0.1)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #00cec9' }}>
                {normalized.qualityAttributes.resilience}
              </div>
            )}
          </div>
        )}

        {/* Architectural Decisions */}
        {activeTab === 'decisions' && (
          <div className="fade-in">
            {normalized.architectureDecisions.map((adr, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '10px',
                  padding: '14px',
                  marginBottom: '12px',
                  borderLeft: '3px solid #a29bfe',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedAdr(expandedAdr === idx ? null : idx)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#00cec9', fontWeight: 600, fontSize: '0.95rem' }}>
                    {adr.decision}
                  </span>
                  <span style={{ color: '#a29bfe' }}>{expandedAdr === idx ? '▼' : '▶'}</span>
                </div>

                {expandedAdr === idx && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(108,92,231,0.2)' }}>
                    <div style={{ marginBottom: '10px' }}>
                      <strong style={{ color: '#b2bec3' }}>Rationale:</strong>
                      <p style={{ color: '#636e72', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                        {adr.rationale}
                      </p>
                    </div>
                    {(adr.alternatives || []).length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#b2bec3' }}>Alternatives:</strong>
                        <ul style={{ color: '#636e72', fontSize: '0.85rem', margin: '4px 0 0 24px', paddingLeft: 0 }}>
                          {(adr.alternatives || []).map((alt, i) => (
                            <li key={i}>{alt}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <strong style={{ color: '#b2bec3' }}>Trade-offs:</strong>
                      <p style={{ color: '#636e72', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                        {adr.tradeoffs}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
