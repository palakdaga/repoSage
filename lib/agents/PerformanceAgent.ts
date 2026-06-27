import { BaseAgent } from './BaseAgent';
import { RepositoryContext, PerformanceIssue } from '@/lib/types';
import { Groq } from 'groq-sdk';

interface PerfPattern {
  name: string;
  pattern: RegExp;
  severity: PerformanceIssue['severity'];
  category: string;
  description: string;
  suggestion: string;
  languages: string[];
}

const PERF_PATTERNS: PerfPattern[] = [
  {
    name: 'Synchronous File I/O',
    pattern: /(?:readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync)/g,
    severity: 'high',
    category: 'I/O',
    description: 'Synchronous file operations block the event loop and freeze the application',
    suggestion: 'Use async alternatives (readFile, writeFile, etc.) with await',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'N+1 Query Pattern',
    pattern: /(?:for|forEach)\s*\([^)]*\)\s*\{[^}]*(?:await|\.then)[^}]*(?:find|query|select|fetch|findOne)/g,
    severity: 'high',
    category: 'Database',
    description: 'Database queries inside loops cause N+1 performance issues and database load',
    suggestion: 'Batch queries using findMany(), $in operator, or DataLoader pattern',
    languages: ['javascript', 'typescript', 'python', 'java'],
  },
  {
    name: 'Missing Array Method Optimization',
    pattern: /\.filter\([^)]+\)\.map\(/g,
    severity: 'low',
    category: 'Algorithm',
    description: 'Chained filter().map() iterates the array twice unnecessarily',
    suggestion: 'Use reduce() for single-pass processing, or flatMap() for efficiency',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Large Bundle Import',
    pattern: /import\s+(?:\*\s+as\s+\w+|{\s*default\s*}|[^}]*)\s+from\s+['"](?:lodash|moment|date-fns|rxjs)['"]/g,
    severity: 'medium',
    category: 'Bundle Size',
    description: 'Importing entire libraries increases bundle size and slows initial load',
    suggestion: 'Use tree-shakeable imports: import { specific } from "lodash/specific"',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'String Concatenation in Loop',
    pattern: /(?:for|while)\s*\([^)]*\)\s*\{[^}]*(?:\+\=\s*['"]|string\s*\+|concat\()(?!.*(?:array|join|\[))/g,
    severity: 'medium',
    category: 'Memory',
    description: 'String concatenation in loops creates many intermediate strings and wastes memory',
    suggestion: 'Use array.push() and array.join() or template literals for building strings',
    languages: ['javascript', 'typescript', 'python', 'java'],
  },
  {
    name: 'Unhandled Promise Rejection',
    pattern: /(?:new\s+Promise|\.then\s*\()\s*\(\s*(?:resolve|reject)\s*\)\s*=>\s*\{(?!.*\.catch)/g,
    severity: 'high',
    category: 'Async',
    description: 'Promise without error handling can cause unhandled rejections and memory leaks',
    suggestion: 'Always add .catch() or use try/catch with async/await',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Large Synchronous JSON Parse',
    pattern: /JSON\.parse\s*\(\s*(?:fs\.readFileSync|readFileSync|require\s*\()/g,
    severity: 'medium',
    category: 'Memory',
    description: 'Parsing large JSON files synchronously locks the event loop and uses significant memory',
    suggestion: 'Use async file reading with streaming JSON parsers or JSONStream for large files',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Missing Database Query Limit',
    pattern: /\.find\(\s*\{[^}]*\}\s*\)(?!.*(?:\.limit|\.take|\.slice))/g,
    severity: 'medium',
    category: 'Database',
    description: 'Unbounded database queries can fetch massive datasets and cause memory issues',
    suggestion: 'Add .limit() for bounded results and ensure appropriate indexes exist',
    languages: ['javascript', 'typescript', 'python'],
  },
  {
    name: 'Inefficient Loop with Object Lookup',
    pattern: /for\s*\([^)]*\)\s*\{[^}]*(?:Object\.keys|Object\.entries|for\.\.\.in)[^}]*\[/g,
    severity: 'low',
    category: 'Algorithm',
    description: 'Inefficient loops over object keys or array iterations',
    suggestion: 'Use modern array methods (map, filter, reduce) instead of manual iterations',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Missing Lazy Loading',
    pattern: /import\s+(?:components|pages|modules)\s+from\s+['"][^'"]*['"];.*export/g,
    severity: 'low',
    category: 'Bundle Size',
    description: 'Routes or components loaded upfront instead of on-demand',
    suggestion: 'Use dynamic imports: const Module = lazy(() => import("path"))',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Recursive Function Without Base Case Optimization',
    pattern: /function\s+\w+\s*\([^)]*\)\s*\{[^}]*(?:this\.|arguments|recursion)[^}]*\(/g,
    severity: 'medium',
    category: 'Algorithm',
    description: 'Deep recursion can cause stack overflow and performance degradation',
    suggestion: 'Convert to iteration, memoization, or use tail-call optimization',
    languages: ['javascript', 'typescript', 'python', 'java'],
  },
  {
    name: 'Missing Cache Headers',
    pattern: /res\.set\(|response\.header\((?!.*(?:Cache-Control|ETag|Last-Modified))/g,
    severity: 'medium',
    category: 'HTTP',
    description: 'Missing cache headers forces repeated downloads of static resources',
    suggestion: 'Set Cache-Control, ETag, and Last-Modified headers on responses',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'N-way Object Merge in Loop',
    pattern: /(?:Object\.assign|spread\s+operator|{\.\.\.)\s*[^}]*(?:for|while|forEach)\s*\(/g,
    severity: 'medium',
    category: 'Memory',
    description: 'Repeated object merging creates many intermediate objects',
    suggestion: 'Accumulate changes in a single object or use mutable operations',
    languages: ['javascript', 'typescript'],
  },
];

export class PerformanceAgent extends BaseAgent {
  private groq: Groq;

  constructor() {
    super('performance', 'Performance Agent', { timeoutMs: 60000 });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  protected async initialize(): Promise<void> {}

  private async getGroqOptimization(issue: PerformanceIssue, fileContext?: string): Promise<string> {
    try {
      const prompt = `You are a performance optimization expert. An application has a performance issue:

Title: ${issue.title}
Severity: ${issue.severity}
Description: ${issue.description}
Category: ${issue.category}
File: ${issue.filePath}
${fileContext ? `\nCode context:\n${fileContext}` : ''}

Provide a concise, code-focused optimization strategy (2-3 sentences max). Include:
1. Specific optimization technique
2. Expected performance improvement
3. Implementation tool/library if applicable

Start with "Optimize: "`;

      const message = await this.groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });

      return message.choices[0]?.message?.content || issue.suggestion;
    } catch (error) {
      console.error('Groq API error:', error);
      return issue.suggestion;
    }
  }

  private async getDetailedOptimizationPlan(issue: PerformanceIssue): Promise<{
    explanation: string;
    impact: string;
    steps: string[];
    codeExample: string;
  }> {
    try {
      const prompt = `You are a performance optimization expert. Provide a detailed performance issue analysis in JSON format:

Performance Issue: ${issue.title}
Description: ${issue.description}

Return ONLY valid JSON (no markdown code blocks) with this structure:
{
  "explanation": "1-2 sentences explaining WHY this causes performance issues in technical detail",
  "impact": "1-2 sentences on performance impact (latency, throughput, memory, CPU)",
  "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "codeExample": "Before/After code snippet showing the optimization (max 10 lines)"
}`;

      const message = await this.groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.choices[0]?.message?.content || '{}';
      const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedText);
      return {
        explanation: parsed.explanation || '',
        impact: parsed.impact || '',
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        codeExample: parsed.codeExample || '',
      };
    } catch (error) {
      console.error('Detailed optimization generation error:', error);
      return {
        explanation: issue.description,
        impact: 'Impacts application responsiveness and resource utilization',
        steps: [
          issue.suggestion,
        ],
        codeExample: '// Optimization implementation depends on specific context',
      };
    }
  }

  protected async execute(input: unknown): Promise<PerformanceIssue[]> {
    const context = input as RepositoryContext;
    const issues: PerformanceIssue[] = [];
    const issuesByType: Record<string, PerformanceIssue> = {};

    const filesToScan = context.files.filter(
      (f) => !f.path.includes('node_modules') && !f.path.includes('.min.') && f.language !== 'unknown'
    );

    let scanned = 0;
    for (const file of filesToScan) {
      this.updateStatus(
        'processing',
        10 + Math.round((scanned / filesToScan.length) * 80),
        `Profiling: ${file.name}`
      );

      for (const pattern of PERF_PATTERNS) {
        if (!pattern.languages.includes(file.language)) continue;

        const matches = file.content.matchAll(pattern.pattern);
        for (const match of matches) {
          const typeKey = `${pattern.name}:${file.path}`;

          // Only add one instance per issue type per file
          if (!issuesByType[typeKey]) {
            const lineNumber = file.content.substring(0, match.index || 0).split('\n').length;

            // Extract the matched code line + 1 line before/after for context
            const allLines = file.content.split('\n');
            const startCtx = Math.max(0, lineNumber - 2);
            const endCtx = Math.min(allLines.length - 1, lineNumber);
            const codeSnippet = allLines.slice(startCtx, endCtx + 1)
              .map((l, i) => `${startCtx + i + 1} | ${l}`)
              .join('\n');

            const issue: PerformanceIssue = {
              id: `perf_${Object.keys(issuesByType).length}_${Date.now()}`,
              severity: pattern.severity,
              title: pattern.name,
              description: pattern.description,
              filePath: file.path,
              lineNumber,
              category: pattern.category,
              suggestion: pattern.suggestion,
              codeExample: codeSnippet,
            };
            issuesByType[typeKey] = issue;
            issues.push(issue);
          }
        }
      }

      // Check file size (once per file)
      if (file.size > 500 * 1024) {
        const fileSizeKey = `Large File:${file.path}`;
        if (!issuesByType[fileSizeKey]) {
          const issue: PerformanceIssue = {
            id: `perf_${Object.keys(issuesByType).length}_${Date.now()}`,
            severity: 'medium',
            title: 'Large Source File',
            description: `File is ${Math.round(file.size / 1024)}KB — large files impact build times and developer experience`,
            filePath: file.path,
            category: 'Maintainability',
            suggestion: 'Consider splitting into smaller, focused modules',
          };
          issuesByType[fileSizeKey] = issue;
          issues.push(issue);
        }
      }

      // Check for deeply nested callbacks (callback hell)
      const callbackDepth = (file.content.match(/\.then\s*\(/g) || []).length;
      if (callbackDepth > 5 && file.language === 'javascript') {
        const callbackKey = `Callback Hell:${file.path}`;
        if (!issuesByType[callbackKey]) {
          const issue: PerformanceIssue = {
            id: `perf_${Object.keys(issuesByType).length}_${Date.now()}`,
            severity: 'medium',
            title: 'Deep Callback Nesting (Callback Hell)',
            description: 'Multiple .then() chains make code hard to follow and debug',
            filePath: file.path,
            category: 'Readability',
            suggestion: 'Convert to async/await for cleaner, more readable async code',
          };
          issuesByType[callbackKey] = issue;
          issues.push(issue);
        }
      }

      // Check for missing compression
      if (file.name.endsWith('.json') && file.size > 100 * 1024) {
        const compressionKey = `Large Data File:${file.path}`;
        if (!issuesByType[compressionKey]) {
          const issue: PerformanceIssue = {
            id: `perf_${Object.keys(issuesByType).length}_${Date.now()}`,
            severity: 'low',
            title: 'Large Data File Without Compression',
            description: `${file.name} is ${Math.round(file.size / 1024)}KB — consider gzip or brotli compression`,
            filePath: file.path,
            category: 'Bundle Size',
            suggestion: 'Enable gzip/brotli compression in server configuration',
          };
          issuesByType[compressionKey] = issue;
          issues.push(issue);
        }
      }

      scanned++;
    }

    // Check for missing package.json optimizations
    const packageFile = context.files.find(f => f.path === 'package.json');
    if (packageFile && !packageFile.content.includes('"type": "module"')) {
      const esModuleKey = 'Missing ES Modules Support';
      if (!issuesByType[esModuleKey]) {
        const issue: PerformanceIssue = {
          id: `perf_${Object.keys(issuesByType).length}_${Date.now()}`,
          severity: 'low',
          title: 'ES Modules Not Configured',
          description: 'Project uses CommonJS which can be slower than ES modules',
          filePath: 'package.json',
          category: 'Module System',
          suggestion: 'Add "type": "module" to package.json for native ES module support',
        };
        issuesByType[esModuleKey] = issue;
        issues.push(issue);
      }
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Generate Groq optimizations and detailed plans for ALL issues
    for (let i = 0; i < issues.length; i++) {
      this.updateStatus('processing', 85 + Math.round((i / issues.length) * 14), `AI optimization ${i + 1}/${issues.length}...`);
      const issue = issues[i];
      const relatedFile = context.files.find(f => f.path === issue.filePath);
      const fileContext = relatedFile ? relatedFile.content.substring(0, 500) : '';

      // Get Groq optimization for every issue
      issue.groqOptimization = await this.getGroqOptimization(issue, fileContext);

      // Get detailed plans for critical and high severity
      if (issue.severity === 'critical' || issue.severity === 'high') {
        const details = await this.getDetailedOptimizationPlan(issue);
        issue.detailedExplanation = details.explanation;
        issue.impact = details.impact;
        issue.stepBySolution = details.steps;
        // Keep code snippet from actual match
      }
    }

    return issues;
  }
}
