import { BaseAgent } from './BaseAgent';
import { OllamaService } from '@/lib/services/OllamaService';
import { DocumentationResult } from '@/lib/types';
import { Logger } from '@/lib/utils/errors';

interface RefinementInput {
  documentation: DocumentationResult;
  repoName: string;
}

export class RefinementAgent extends BaseAgent {
  private ollama!: OllamaService;

  constructor(ollama?: OllamaService) {
    super('refinement', 'Refinement Agent', { timeoutMs: 120000, maxRetries: 1 });
    if (ollama) this.ollama = ollama;
  }

  protected async initialize(): Promise<void> {
    if (!this.ollama) this.ollama = new OllamaService();
  }

  protected async execute(input: unknown): Promise<DocumentationResult> {
    const { documentation, repoName } = input as RefinementInput;
    const refined = { ...documentation };
    const isLLM = await this.ollama.isAvailable();

    // 1. Improve summary quality
    this.updateStatus('processing', 20, 'Refining executive summary...');
    if (isLLM && refined.summary.length > 20) {
      try {
        const betterSummary = await this.ollama.generateCompletion(
          `Improve this documentation summary for clarity, completeness, and professional quality. Keep the same information but make it more polished:\n\n${refined.summary}`,
          'You are a technical writer. Improve documentation quality while preserving accuracy.'
        );
        if (betterSummary.length > 50) {
          refined.summary = betterSummary;
        }
      } catch {
        Logger.warn('[RefinementAgent] Summary refinement failed');
      }
    }

    // 2. Add cross-references
    this.updateStatus('processing', 50, 'Adding cross-references...');
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

    // 3. Generate quality score
    this.updateStatus('processing', 80, 'Computing quality score...');
    const qualityScore = this.computeQualityScore(refined);
    refined.summary = `${refined.summary}\n\n---\n📊 **Documentation Quality Score**: ${qualityScore}/100`;

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

  private computeQualityScore(doc: DocumentationResult): number {
    let score = 0;
    if (doc.summary.length > 100) score += 20;
    else if (doc.summary.length > 50) score += 10;

    if (doc.architecture.length > 100) score += 20;
    else if (doc.architecture.length > 50) score += 10;

    if (doc.setupInstructions.length > 50) score += 15;
    if (doc.apiDocs && doc.apiDocs.length > 50) score += 15;

    const fileSections = doc.sections.filter((s) => s.type === 'file');
    if (fileSections.length > 10) score += 20;
    else if (fileSections.length > 5) score += 15;
    else if (fileSections.length > 0) score += 10;

    // Cross-reference bonus
    const crossRefCount = doc.sections.filter((s) => s.content.includes('**Related files**')).length;
    if (crossRefCount > 5) score += 10;
    else if (crossRefCount > 0) score += 5;

    return Math.min(100, score);
  }
}
