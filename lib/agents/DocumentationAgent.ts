import { BaseAgent } from './BaseAgent';
import { OllamaService } from '@/lib/services/OllamaService';
import { RepositoryContext, UnderstandingResult, DocumentationResult, DocumentationSection } from '@/lib/types';
import { Logger } from '@/lib/utils/errors';
import { RepoMetadataExtractor } from '@/lib/utils/RepoMetadataExtractor';

interface DocInput {
  context: RepositoryContext;
  understanding: UnderstandingResult;
}

export class DocumentationAgent extends BaseAgent {
  private ollama!: OllamaService;

  constructor(ollama?: OllamaService) {
    super('documentation', 'Documentation Agent', { timeoutMs: 180000 });
    if (ollama) this.ollama = ollama;
  }

  protected async initialize(): Promise<void> {
    if (!this.ollama) this.ollama = new OllamaService();
  }

  protected async execute(input: unknown): Promise<DocumentationResult> {
    const { context, understanding } = input as DocInput;
    const sections: DocumentationSection[] = [];
    const isLLM = await this.ollama.isAvailable();

    // Extract real metadata to ensure accuracy
    const metadata = RepoMetadataExtractor.extract(context);

    // 1. Combined summary + architecture in a SINGLE LLM call (was 2 separate calls)
    this.updateStatus('processing', 15, 'Generating documentation...');
    const { summary, architecture } = await this.generateCombinedDocs(context, understanding, metadata, isLLM);
    sections.push({ title: 'Executive Summary', content: summary, type: 'summary' });
    sections.push({ title: 'Architecture', content: architecture, type: 'architecture' });

    // 2. Setup guide - use REAL data, not heuristics
    this.updateStatus('processing', 60, 'Creating setup guide...');
    const setup = this.generateSetupGuide(context, metadata);
    sections.push({ title: 'Setup Guide', content: setup, type: 'setup' });

    // 3. API documentation (no LLM, pure parsing)
    this.updateStatus('processing', 75, 'Documenting APIs...');
    const apiDocs = this.generateAPIDocs(understanding, metadata);
    if (apiDocs) {
      sections.push({ title: 'API Reference', content: apiDocs, type: 'api' });
    }

    // 4. File documentation
    this.updateStatus('processing', 85, 'Compiling file docs...');
    for (const [path, fileSummary] of Object.entries(understanding.fileSummaries)) {
      sections.push({ title: path, content: fileSummary, type: 'file', filePath: path });
    }

    return { summary, architecture, setupInstructions: setup, apiDocs: apiDocs || '', sections };
  }

  /**
   * Combined summary + architecture in ONE LLM call instead of two.
   * Now uses REAL repository data to avoid hallucinations
   */
  private async generateCombinedDocs(
    ctx: RepositoryContext, und: UnderstandingResult, metadata: any, useLLM: boolean
  ): Promise<{ summary: string; architecture: string }> {
    const info = ctx.repoInfo;

    // Extract actual README content for grounding
    const readme = ctx.files.find(f => f.path.match(/^README(\.|$)/i));
    const readmeContent = readme?.content || '';

    const langList = [...new Set(ctx.files.map(f => f.language))].filter(l => l !== 'unknown').join(', ');
    const frameworks = und.detectedFrameworks.join(', ') || 'None detected';
    const patterns = und.detectedPatterns.join(', ') || 'Standard';

    const actualInfo = `
PROJECT: ${info.name} by ${info.owner}
PURPOSE: ${metadata.purpose}
PROBLEMS SOLVED: ${metadata.problems.join(', ')}
KEY FEATURES: ${metadata.keyFeatures.join(', ')}
PROJECT TYPE: ${metadata.projectType}
MAIN COMPONENTS: ${metadata.components.map((c: any) => c.name).join(', ')}
${readmeContent.slice(0, 500)}
`;

    if (useLLM) {
      try {
        const combined = await this.ollama.generateCompletion(
          `Write professional documentation for this REAL repository:

${actualInfo}

Provide TWO sections separated by "---ARCHITECTURE---":
Section 1 - Executive Summary: Overview based on actual project info above
Section 2 - Architecture: Based on real structure and components listed above`,
          'Base your response ONLY on the actual data provided above. Be factual, not generic. Use exact project names, actual components, real features.'
        );

        const parts = combined.split('---ARCHITECTURE---');
        if (parts.length >= 2) {
          return {
            summary: parts[0].trim(),
            architecture: parts[1].trim(),
          };
        }
        return {
          summary: combined.trim(),
          architecture: und.architectureOverview,
        };
      } catch {
        Logger.warn('[DocumentationAgent] LLM combined docs failed');
      }
    }

    // Fallback: use real data, not generic templates
    const summary = `# ${info.name}

${metadata.purpose}

## Key Features
${metadata.keyFeatures.map((f: string) => `- ${f}`).join('\n') || '- Project provides structured architecture'}

## Project Overview
- **Type**: ${metadata.projectType}
- **Components**: ${metadata.components.map((c: any) => c.name).join(', ')}
- **Languages**: ${langList}
- **Frameworks**: ${frameworks}
- **Stars**: ${info.stars} | **Forks**: ${info.forks}

## What Problems Does It Solve?
${metadata.problems.map((p: string) => `- ${p}`).join('\n') || 'Domain-specific problems with structured architecture'}`;

    return { summary, architecture: und.architectureOverview };
  }

  private generateSetupGuide(ctx: RepositoryContext, metadata: any): string {
    let guide = `# Getting Started with ${ctx.repoInfo.name}\n\n`;
    guide += `## Prerequisites\n\n`;

    // Use REAL setup steps from metadata
    if (metadata.setupSteps.length > 0) {
      // Detect what type of project it is
      const hasPkg = ctx.files.some(f => f.path === 'package.json');
      const hasReqs = ctx.files.some(f => f.path === 'requirements.txt');

      if (hasPkg) {
        guide += `- Node.js (v16 or higher)\n- npm or yarn\n\n`;
      } else if (hasReqs) {
        guide += `- Python 3.8+\n- pip\n\n`;
      }

      guide += `## Installation\n\n\`\`\`bash\ngit clone ${ctx.repoInfo.url}\ncd ${ctx.repoInfo.name}\n`;

      // Add REAL setup steps
      metadata.setupSteps.forEach((step: string) => {
        guide += `${step}\n`;
      });

      guide += `\`\`\`\n`;

      // Add actual dev script if it exists
      if (metadata.devScript) {
        guide += `\n## Development\n\n\`\`\`bash\n${metadata.devScript}\n\`\`\`\n`;
      }

      // Add actual build script if it exists
      if (metadata.buildScript) {
        guide += `\n## Build\n\n\`\`\`bash\n${metadata.buildScript}\n\`\`\`\n`;
      }

      // Add test script if it exists
      if (metadata.testScript) {
        guide += `\n## Testing\n\n\`\`\`bash\n${metadata.testScript}\n\`\`\`\n`;
      }
    } else {
      guide += `- Check README.md for specific requirements\n\n`;
      guide += `## Installation\n\n\`\`\`bash\ngit clone ${ctx.repoInfo.url}\ncd ${ctx.repoInfo.name}\n\`\`\`\n`;
    }

    if (ctx.files.some(f => f.path === '.env.example' || f.path === '.env')) {
      guide += `\n## Environment Variables\n\nCopy \`.env.example\` to \`.env\` and configure the required variables.\n`;
    }

    // Add Docker instructions if available
    if (metadata.hasDocker) {
      guide += `\n## Docker\n\n\`\`\`bash\ndocker build -t ${ctx.repoInfo.name.toLowerCase()} .\ndocker run ${ctx.repoInfo.name.toLowerCase()}\n\`\`\`\n`;
    }

    return guide;
  }

  private generateAPIDocs(und: UnderstandingResult, metadata: any): string | null {
    if (und.apiEndpoints.length === 0 && metadata.publicApis.length === 0) return null;

    let docs = `# API Reference\n\n`;

    // Include real APIs from metadata
    if (metadata.publicApis.length > 0) {
      docs += `## Exported APIs\n\n`;
      metadata.publicApis.forEach((api: string) => {
        docs += `- \`${api}\`\n`;
      });
      docs += `\n`;
    }

    // Include endpoints from understanding
    if (und.apiEndpoints.length > 0) {
      const grouped: Record<string, typeof und.apiEndpoints> = {};

      for (const ep of und.apiEndpoints) {
        const base = ep.path.split('/').slice(0, 3).join('/');
        if (!grouped[base]) grouped[base] = [];
        grouped[base].push(ep);
      }

      docs += `## Endpoints\n\n`;
      for (const [base, endpoints] of Object.entries(grouped)) {
        docs += `### ${base}\n\n`;
        for (const ep of endpoints) {
          docs += `- \`${ep.method} ${ep.path}\` - ${ep.description}\n`;
        }
        docs += `\n`;
      }
    }

    return docs;
  }
}
