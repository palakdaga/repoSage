// Shared TypeScript interfaces and types

export interface RepositoryInfo {
  id: string;
  url: string;
  owner: string;
  name: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  content: string;
  language: string;
}

export interface CodeChunk {
  id: string;
  fileId: string;
  content: string;
  startLine: number;
  endLine: number;
  embedding?: number[];
  metadata: Record<string, unknown>;
}

export interface DocumentationSection {
  title: string;
  content: string;
  type: 'summary' | 'architecture' | 'file' | 'api' | 'setup' | 'security' | 'performance' | 'diagram';
  filePath?: string;
}

export interface AnalysisResult {
  repository: RepositoryInfo;
  summary: string;
  architecture: string;
  fileSummaries: Record<string, string>;
  apiDocs?: string;
  setupInstructions: string;
  documentationSections: DocumentationSection[];
  diagrams: DiagramData[];
  securityFindings: SecurityFinding[];
  performanceIssues: PerformanceIssue[];
  projectMetrics: ProjectMetric[];
  processingTime: number;
  agentResults: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ChatContext {
  repositoryId: string;
  sessionId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentStatus {
  agentId: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  currentTask?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ProcessingProgress {
  repositoryId: string;
  status: 'cloning' | 'parsing' | 'embedding' | 'generating' | 'completed' | 'failed';
  progress: number;
  currentFile?: string;
  totalFiles: number;
  processedFiles: number;
  estimatedTimeRemaining?: number;
  error?: string;
}

// ─── ANTIGRAVITY Agent Types ───

export interface RepositoryContext {
  repoInfo: RepositoryInfo;
  repoPath: string;
  files: FileInfo[];
  chunks: CodeChunk[];
  accessToken?: string;
}

export interface DiagramData {
  id: string;
  title: string;
  type: 'architecture' | 'dependency' | 'component' | 'flow' | 'class';
  mermaidCode: string;
}

export interface SecurityFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
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

export interface PerformanceIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
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

export interface ProjectMetric {
  category: string;
  name: string;
  value: string | number;
  targetValue?: string | number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  description: string;
  groqInsight?: string;
}

export interface UnderstandingResult {
  fileSummaries: Record<string, string>;
  architectureOverview: string;
  detectedPatterns: string[];
  detectedFrameworks: string[];
  apiEndpoints: Array<{ method: string; path: string; description: string }>;
}

export interface DocumentationResult {
  summary: string;
  architecture: string;
  setupInstructions: string;
  apiDocs: string;
  sections: DocumentationSection[];
}

export interface PipelineResult {
  repository: RepositoryInfo;
  context: RepositoryContext;
  understanding: UnderstandingResult;
  documentation: DocumentationResult;
  diagrams: DiagramData[];
  security: SecurityFinding[];
  performance: PerformanceIssue[];
  metrics: ProjectMetric[];
  processingTime: number;
}