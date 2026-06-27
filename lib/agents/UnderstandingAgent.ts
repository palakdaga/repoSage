import { BaseAgent } from './BaseAgent';
import { OllamaService } from '@/lib/services/OllamaService';
import { RepositoryContext, UnderstandingResult, FileInfo } from '@/lib/types';
import { CodeParser } from '@/lib/services/parser';
import { Logger } from '@/lib/utils/errors';

export class UnderstandingAgent extends BaseAgent {
  private ollama!: OllamaService;

  constructor(ollama?: OllamaService) {
    super('understanding', 'Understanding Agent', { timeoutMs: 300000 });
    if (ollama) this.ollama = ollama;
  }

  protected async initialize(): Promise<void> {
    if (!this.ollama) this.ollama = new OllamaService();
  }

  protected async execute(input: unknown): Promise<UnderstandingResult> {
    const context = input as RepositoryContext;
    const fileSummaries: Record<string, string> = {};
    const allPatterns: string[] = [];
    const allFrameworks: string[] = [];
    const apiEndpoints: Array<{ method: string; path: string; description: string }> = [];

    const isLLMAvailable = await this.ollama.isAvailable();

    // Sort files by importance: entry points and configs first
    const sortedFiles = this.sortByImportance(context.files);
    const filesToProcess = sortedFiles.slice(0, 40);

    // Step 1: Generate heuristic summaries for ALL files (instant, no LLM)
    for (const file of filesToProcess) {
      fileSummaries[file.path] = this.heuristicSummary(file);
      this.detectPatterns(file, allPatterns);
      this.detectFrameworks(file, allFrameworks);
      this.extractAPIEndpoints(file, apiEndpoints);
    }

    // Step 2: Enhance key files with batched LLM calls (fewer, smarter calls)
    if (isLLMAvailable) {
      this.updateStatus('processing', 30, 'Enhancing summaries with AI...');
      await this.enhanceWithBatchedLLM(filesToProcess, fileSummaries);
    }

    // Step 3: Generate architecture overview
    this.updateStatus('processing', 80, 'Generating architecture overview...');
    const architectureOverview = await this.generateArchitectureOverview(context, isLLMAvailable);

    return {
      fileSummaries,
      architectureOverview,
      detectedPatterns: [...new Set(allPatterns)],
      detectedFrameworks: [...new Set(allFrameworks)],
      apiEndpoints,
    };
  }

  /**
   * Sort files so entry points, configs, and key files come first.
   */
  private sortByImportance(files: FileInfo[]): FileInfo[] {
    const importanceScore = (f: FileInfo): number => {
      const p = f.path.toLowerCase();
      const n = f.name.toLowerCase();
      let score = 0;
      // Entry points / main files
      if (n.includes('index') || n.includes('main') || n.includes('app')) score += 10;
      // Config files
      if (n.includes('config') || n.includes('package.json') || n.includes('.env')) score += 8;
      // Route/API files
      if (p.includes('/api/') || p.includes('route')) score += 7;
      // README / docs
      if (n.includes('readme') || n === 'readme.md') score += 9;
      // Penalize very large files
      if (f.size > 5000) score -= 2;
      // Penalize test files
      if (p.includes('test') || p.includes('spec') || p.includes('__test')) score -= 3;
      return score;
    };
    return [...files].sort((a, b) => importanceScore(b) - importanceScore(a));
  }

  /**
   * Batch files by directory and send grouped LLM prompts.
   * Instead of 30 individual calls, groups files into ~4-6 batch calls.
   */
  private async enhanceWithBatchedLLM(
    files: FileInfo[],
    summaries: Record<string, string>
  ): Promise<void> {
    // Only enhance important files with LLM (top 20, under 8KB)
    const keyFiles = files
      .filter((f) => f.size < 8000 && f.language !== 'json' && f.language !== 'unknown')
      .slice(0, 20);

    // Group by directory
    const groups = new Map<string, FileInfo[]>();
    for (const file of keyFiles) {
      const dir = file.path.split(/[/\\]/).slice(0, -1).join('/') || '.';
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir)!.push(file);
    }

    // Batch each group into prompts of ~6 files max
    const batches: FileInfo[][] = [];
    for (const groupFiles of groups.values()) {
      for (let i = 0; i < groupFiles.length; i += 6) {
        batches.push(groupFiles.slice(i, i + 6));
      }
    }

    // Process batches in parallel (3 at a time to avoid overloading Ollama)
    const PARALLEL_BATCHES = 3;
    for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
      const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);
      const pct = 30 + Math.round((i / batches.length) * 50);
      this.updateStatus('processing', pct, `AI analysis batch ${i + 1}/${batches.length}...`);

      const results = await Promise.allSettled(
        parallelBatches.map((batch) => this.summarizeBatch(batch))
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          for (const [path, summary] of Object.entries(result.value)) {
            if (summary.length > 20) {
              summaries[path] = summary;
            }
          }
        }
      }
    }
  }

  /**
   * Summarize a batch of files in a single LLM call.
   */
  private async summarizeBatch(files: FileInfo[]): Promise<Record<string, string>> {
    const fileDescriptions = files
      .map((f) => {
        const snippet = f.content.substring(0, 1200);
        return `### ${f.path} (${f.language}, ${f.content.split('\n').length} lines)\n\`\`\`\n${snippet}\n\`\`\``;
      })
      .join('\n\n');

    const prompt = `Analyze these source files and provide a concise 2-3 sentence summary for EACH file. Format your response as:\n**filepath**: summary\n\n${fileDescriptions}`;

    try {
      const response = await this.ollama.generateCompletion(
        prompt,
        'You are a senior software engineer. Provide concise, technical file summaries. Always format as **filepath**: summary for each file.'
      );

      // Parse the response into per-file summaries
      const result: Record<string, string> = {};
      for (const file of files) {
        // Try to find this file's summary in the response
        const escaped = file.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\*\\*${escaped}\\*\\*:\\s*(.+?)(?=\\n\\*\\*|$)`, 's');
        const match = response.match(regex);
        if (match && match[1]) {
          result[file.path] = match[1].trim();
        }
      }
      return result;
    } catch {
      Logger.warn('[UnderstandingAgent] Batch LLM summary failed');
      return {};
    }
  }

  private heuristicSummary(file: FileInfo): string {
    const lines = file.content.split('\n').length;
    const functions = CodeParser.extractFunctions(file.content, file.language);
    const classes = CodeParser.extractClasses(file.content, file.language);
    const imports = CodeParser.extractImports(file.content, file.language);

    let summary = `**${file.name}** (${file.language}, ${lines} lines)`;
    if (classes.length > 0) summary += `\nClasses: ${classes.join(', ')}`;
    if (functions.length > 0) summary += `\nFunctions: ${functions.slice(0, 8).join(', ')}${functions.length > 8 ? ` (+${functions.length - 8} more)` : ''}`;
    if (imports.length > 0) summary += `\nDependencies: ${imports.length} imports`;
    return summary;
  }

  private detectPatterns(file: FileInfo, patterns: string[]): void {
    const content = file.content.toLowerCase();
    if (content.includes('singleton') || content.match(/static\s+getInstance/)) patterns.push('Singleton Pattern');
    if (content.includes('observer') || content.includes('eventemitter')) patterns.push('Observer Pattern');
    if (content.includes('factory')) patterns.push('Factory Pattern');
    if (content.includes('middleware')) patterns.push('Middleware Pattern');
    if (content.includes('async') && content.includes('await')) patterns.push('Async/Await');
    if (content.includes('usestate') || content.includes('useeffect')) patterns.push('React Hooks');
    if (content.includes('export default')) patterns.push('ES Modules');
    if (content.includes('decorator') || content.match(/@\w+/)) patterns.push('Decorator Pattern');
  }

  private detectFrameworks(file: FileInfo, frameworks: string[]): void {
    const content = file.content.toLowerCase();
    const checks: [string, string][] = [
      ['react', 'React'], ['next', 'Next.js'], ['express', 'Express.js'],
      ['fastapi', 'FastAPI'], ['django', 'Django'], ['flask', 'Flask'],
      ['vue', 'Vue.js'], ['angular', 'Angular'], ['svelte', 'Svelte'],
      ['mongoose', 'Mongoose'], ['prisma', 'Prisma'], ['typeorm', 'TypeORM'],
      ['tailwindcss', 'TailwindCSS'], ['socket.io', 'Socket.IO'],
    ];
    for (const [keyword, name] of checks) {
      if (content.includes(keyword)) frameworks.push(name);
    }
  }

  private extractAPIEndpoints(
    file: FileInfo,
    endpoints: Array<{ method: string; path: string; description: string }>
  ): void {
    const content = file.content;
    // Express-style routes
    const routePatterns = [
      /\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    ];
    for (const pattern of routePatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          description: `${match[1].toUpperCase()} endpoint in ${file.path}`,
        });
      }
    }
    // Next.js API routes
    if (file.path.includes('/api/') && file.path.endsWith('route.ts')) {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methods) {
        if (content.includes(`export async function ${method}`)) {
          const apiPath = file.path.replace(/.*\/app/, '').replace('/route.ts', '').replace(/\\/g, '/');
          endpoints.push({ method, path: apiPath, description: `Next.js API route in ${file.path}` });
        }
      }
    }
  }

  private async generateArchitectureOverview(
    context: RepositoryContext,
    useLLM: boolean
  ): Promise<string> {
    const dirs = new Set<string>();
    const langs = new Set<string>();
    context.files.forEach((f) => {
      const topDir = f.path.split(/[/\\]/)[0];
      if (topDir) dirs.add(topDir);
      if (f.language !== 'unknown') langs.add(f.language);
    });

    const structureInfo = `Repository: ${context.repoInfo.name}
Owner: ${context.repoInfo.owner}
Files: ${context.files.length}
Languages: ${[...langs].join(', ')}
Top-level directories: ${[...dirs].join(', ')}`;

    if (useLLM) {
      try {
        return await this.ollama.generateCompletion(
          `Analyze the following codebase structure and provide a comprehensive architecture overview:\n\n${structureInfo}`,
          'You are a senior software architect. Provide clear, structured architecture analysis with sections for project type, patterns, components, and data flow.'
        );
      } catch {
        Logger.warn('[UnderstandingAgent] LLM architecture overview failed, using heuristic');
      }
    }

    return `## Architecture Overview\n\n${structureInfo}\n\nThis project contains ${context.files.length} source files across ${dirs.size} directories, primarily using ${[...langs].slice(0, 3).join(', ')}.`;
  }
}
