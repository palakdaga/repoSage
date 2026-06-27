import { BaseAgent, AgentStatusInfo } from './BaseAgent';
import { AgentCommunicationBus } from './AgentCommunicationBus';
import { IngestionAgent } from './IngestionAgent';
import { UnderstandingAgent } from './UnderstandingAgent';
import { DocumentationAgent } from './DocumentationAgent';
import { DiagramAgent } from './DiagramAgent';
import { SecurityAgent } from './SecurityAgent';
import { PerformanceAgent } from './PerformanceAgent';
import { ArchitectureAnalyzerAgent, ArchitectureAnalysis } from './ArchitectureAnalyzerAgent';
import { MetricsAgent } from './MetricsAgent';
import { OllamaService } from '@/lib/services/OllamaService';
import { VectorDBService } from '@/lib/services/VectorDBService';
import { RAGPipeline } from '@/lib/services/RAGPipeline';
import { GitService } from '@/lib/services/git';
import {
  RepositoryContext,
  UnderstandingResult,
  DocumentationResult,
  DiagramData,
  SecurityFinding,
  PerformanceIssue,
  AnalysisResult,
  ProjectMetric,
} from '@/lib/types';
import { Logger } from '@/lib/utils/errors';

export interface CoordinatorStatus {
  overallProgress: number;
  currentPhase: string;
  agents: AgentStatusInfo[];
  startedAt: Date;
  estimatedCompletion?: Date;
}

interface CoordinatorInput {
  repositoryUrl: string;
  accessToken?: string;
}

let sharedCoordinator: AntigravityCoordinator | null = null;
const inflightPipelines = new Map<string, Promise<AnalysisResult>>();

export function getSharedCoordinator(): AntigravityCoordinator {
  if (!sharedCoordinator) {
    sharedCoordinator = new AntigravityCoordinator();
  }
  return sharedCoordinator;
}

export function getSharedRagPipeline(): RAGPipeline {
  return getSharedCoordinator().getRagPipeline();
}

export class AntigravityCoordinator {
  private bus: AgentCommunicationBus;
  private ollama: OllamaService;
  private vectorDB: VectorDBService;
  private ragPipeline: RAGPipeline;

  private ingestion: IngestionAgent;
  private understanding: UnderstandingAgent;
  private documentation: DocumentationAgent;
  private diagram: DiagramAgent;
  private security: SecurityAgent;
  private performance: PerformanceAgent;
  private architecture: ArchitectureAnalyzerAgent;
  private metrics: MetricsAgent;

  private agents: BaseAgent[];
  private statusListeners: Array<(status: CoordinatorStatus) => void> = [];
  private currentStatus: CoordinatorStatus;

  constructor() {
    this.bus = AgentCommunicationBus.getInstance();
    this.ollama = new OllamaService();
    this.vectorDB = new VectorDBService(this.ollama);
    this.ragPipeline = new RAGPipeline(this.ollama, this.vectorDB);

    this.ingestion = new IngestionAgent();
    this.understanding = new UnderstandingAgent(this.ollama);
    this.documentation = new DocumentationAgent(this.ollama);
    this.diagram = new DiagramAgent();
    this.security = new SecurityAgent();
    this.performance = new PerformanceAgent();
    this.architecture = new ArchitectureAnalyzerAgent();
    this.metrics = new MetricsAgent();

    this.agents = [
      this.ingestion,
      this.understanding,
      this.documentation,
      this.diagram,
      this.security,
      this.performance,
      this.architecture,
      this.metrics,
    ];

    this.currentStatus = {
      overallProgress: 0,
      currentPhase: 'Initializing',
      agents: this.agents.map((a) => a.getStatus()),
      startedAt: new Date(),
    };

    for (const agent of this.agents) {
      agent.setStatusListener(() => this.broadcastStatus());
    }

    sharedCoordinator = this;
  }

  onStatusUpdate(listener: (status: CoordinatorStatus) => void): void {
    this.statusListeners.push(listener);
  }

  getStatus(): CoordinatorStatus {
    return {
      ...this.currentStatus,
      agents: this.agents.map((a) => a.getStatus()),
    };
  }

  getRagPipeline(): RAGPipeline {
    return this.ragPipeline;
  }

  async runPipeline(input: CoordinatorInput): Promise<AnalysisResult> {
    const repoKey = input.repositoryUrl;
    const inflight = inflightPipelines.get(repoKey);

    if (inflight) {
      Logger.info(`[Coordinator] Reusing in-flight pipeline for ${repoKey}`);
      return inflight;
    }

    const pipelinePromise = this._runPipelineInternal(input);
    inflightPipelines.set(repoKey, pipelinePromise);

    try {
      return await pipelinePromise;
    } finally {
      inflightPipelines.delete(repoKey);
    }
  }

  private async _runPipelineInternal(input: CoordinatorInput): Promise<AnalysisResult> {
    const startTime = Date.now();
    Logger.info('[Coordinator] Starting ANTIGRAVITY pipeline (optimized)');

    try {
      // ---------------------------
      // Phase 1: Ingestion (no warmup needed — first real call warms Ollama)
      // ---------------------------
      this.updatePhase('Ingesting Repository', 0);
      const context = (await this.ingestion.run(input)) as RepositoryContext;

      // ---------------------------
      // Phase 2: Understanding + RAG Indexing in PARALLEL
      // Understanding only reads files; RAG indexing only embeds chunks. They're independent.
      // ---------------------------
      this.updatePhase('Analyzing Code & Indexing', 20);

      const [understanding, indexedCount] = await Promise.all([
        this.understanding.run(context) as Promise<UnderstandingResult>,
        this.ragPipeline
          .indexRepository(context.repoInfo.id, context.chunks)
          .catch((err) => {
            Logger.warn('[Coordinator] RAG indexing failed (non-fatal)', err);
            return 0;
          }),
      ]);

      Logger.info(`[Coordinator] RAG indexed ${indexedCount} chunks`);

      // ---------------------------
      // Phase 3: Documentation + Non-LLM agents ALL in PARALLEL
      // Documentation depends on understanding (which is now done).
      // Diagrams, Security, Performance, Architecture, Metrics are independent non-LLM agents.
      // ---------------------------
      this.updatePhase('Generating Documentation & Analysis', 55);

      const [documentation, diagrams, securityFindings, performanceIssues, architectureAnalysis, metrics] = await Promise.all([
        this.documentation.run({ context, understanding }) as Promise<DocumentationResult>,
        this.diagram.run(context) as Promise<DiagramData[]>,
        this.security.run(context) as Promise<SecurityFinding[]>,
        this.performance.run(context) as Promise<PerformanceIssue[]>,
        this.architecture.run(context) as Promise<ArchitectureAnalysis>,
        this.metrics.run(context) as Promise<ProjectMetric[]>,
      ]);

      // ---------------------------
      // Phase 4: Inline cross-references (no LLM needed)
      // ---------------------------
      this.updatePhase('Finalizing', 90);
      const refinedDocs = this.inlineCrossReferences(documentation);

      // ---------------------------
      // Cleanup
      // ---------------------------
      try {
        const gitService = new GitService();
        await gitService.cleanupRepository(context.repoPath);
      } catch {
        Logger.warn('[Coordinator] Repo cleanup failed (non-fatal)');
      }

      this.updatePhase('Complete', 100);

      const processingTime = Date.now() - startTime;
      Logger.info(`[Coordinator] Pipeline complete in ${processingTime}ms`);

      // Build summaries
      const fileSummaries: Record<string, string> = {};
      for (const [path, summary] of Object.entries(understanding.fileSummaries)) {
        fileSummaries[path] = summary;
      }

      const result: AnalysisResult = {
        repository: context.repoInfo,
        summary: refinedDocs.summary,
        architecture: refinedDocs.architecture,
        fileSummaries,
        apiDocs: refinedDocs.apiDocs,
        setupInstructions: refinedDocs.setupInstructions,
        documentationSections: refinedDocs.sections,
        diagrams,
        securityFindings,
        performanceIssues,
        projectMetrics: metrics,
        processingTime,
        agentResults: {
          understanding: {
            patterns: understanding.detectedPatterns,
            frameworks: understanding.detectedFrameworks,
            endpoints: understanding.apiEndpoints,
          },
          architecture: architectureAnalysis,
        },
      };

      return result;

    } catch (err) {
      Logger.error('[Coordinator] Pipeline failed', err);
      this.updatePhase('Failed', this.currentStatus.overallProgress);
      throw err;
    }
  }

  /**
   * Inline cross-referencing (from old RefinementAgent).
   * Pure string logic — no LLM call needed.
   */
  private inlineCrossReferences(documentation: DocumentationResult): DocumentationResult {
    const refined = { ...documentation };

    refined.sections = refined.sections.map((section) => {
      if (section.type === 'file' && section.filePath) {
        const relatedFiles = refined.sections
          .filter((s) => s.type === 'file' && s.filePath && s.filePath !== section.filePath)
          .filter((s) => this.areRelated(section.filePath!, s.filePath!))
          .map((s) => s.filePath!);

        if (relatedFiles.length > 0) {
          return {
            ...section,
            content: `${section.content}\n\n**Related files**: ${relatedFiles.join(', ')}`,
          };
        }
      }
      return section;
    });

    // Compute quality score
    let score = 0;
    if (refined.summary.length > 100) score += 20;
    else if (refined.summary.length > 50) score += 10;
    if (refined.architecture.length > 100) score += 20;
    else if (refined.architecture.length > 50) score += 10;
    if (refined.setupInstructions.length > 50) score += 15;
    if (refined.apiDocs && refined.apiDocs.length > 50) score += 15;
    const fileSections = refined.sections.filter((s) => s.type === 'file');
    if (fileSections.length > 10) score += 20;
    else if (fileSections.length > 5) score += 15;
    else if (fileSections.length > 0) score += 10;
    const crossRefCount = refined.sections.filter((s) => s.content.includes('**Related files**')).length;
    if (crossRefCount > 5) score += 10;
    else if (crossRefCount > 0) score += 5;
    score = Math.min(100, score);

    refined.summary = `${refined.summary}\n\n---\n📊 **Documentation Quality Score**: ${score}/100`;
    return refined;
  }

  private areRelated(fileA: string, fileB: string): boolean {
    const dirA = fileA.split(/[/\\]/).slice(0, -1).join('/');
    const dirB = fileB.split(/[/\\]/).slice(0, -1).join('/');
    if (dirA === dirB && dirA !== '') return true;

    const nameA = fileA.split(/[/\\]/).pop()?.replace(/\.\w+$/, '').toLowerCase() || '';
    const nameB = fileB.split(/[/\\]/).pop()?.replace(/\.\w+$/, '').toLowerCase() || '';
    return nameA.includes(nameB) || nameB.includes(nameA);
  }

  private updatePhase(phase: string, progress: number): void {
    this.currentStatus.currentPhase = phase;
    this.currentStatus.overallProgress = progress;
    this.broadcastStatus();
  }

  private broadcastStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch {
        // non-fatal
      }
    }
  }
}