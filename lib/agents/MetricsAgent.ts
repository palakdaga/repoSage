import { BaseAgent } from './BaseAgent';
import { RepositoryContext } from '@/lib/types';
import { Groq } from 'groq-sdk';

export interface ProjectMetric {
  category: string;
  name: string;
  value: string | number;
  targetValue?: string | number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  description: string;
  groqInsight?: string;
}

export class MetricsAgent extends BaseAgent {
  private groq: Groq;

  constructor() {
    super('metrics', 'Metrics Agent', { timeoutMs: 60000 });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  protected async initialize(): Promise<void> {}

  private calculateMetrics(context: RepositoryContext): ProjectMetric[] {
    const metrics: ProjectMetric[] = [];

    const sourceFiles = context.files.filter(f =>
      !f.path.includes('node_modules') && !f.path.includes('dist') &&
      !f.path.includes('.min.') && f.language !== 'unknown'
    );
    const sourceFileCount = sourceFiles.length;

    // ─────── CODE QUALITY & TESTING ───────────
    const testFiles = context.files.filter(f =>
      f.path.includes('test') || f.path.includes('spec') ||
      f.path.includes('.test.') || f.path.includes('.spec.') ||
      f.path.includes('__tests__')
    ).length;
    const testRatio = sourceFileCount > 0 ? (testFiles / sourceFileCount * 100).toFixed(1) : 0;

    metrics.push({
      category: 'Code Quality & Testing',
      name: 'Test Coverage Ratio',
      value: `${testRatio}%`,
      targetValue: '80%',
      status: Number(testRatio) >= 80 ? 'excellent' : Number(testRatio) >= 50 ? 'good' : Number(testRatio) >= 20 ? 'warning' : 'critical',
      description: `${testFiles} test file(s) out of ${sourceFileCount} source files. Higher ratio means better test coverage potential. Aim for at least 1 test file per module.`,
    });

    // Lines of code per language
    const locByLanguage: Record<string, number> = {};
    let totalLOC = 0;
    for (const f of sourceFiles) {
      const loc = f.content.split('\n').filter(l => l.trim().length > 0).length;
      locByLanguage[f.language] = (locByLanguage[f.language] || 0) + loc;
      totalLOC += loc;
    }
    const topLanguages = Object.entries(locByLanguage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([lang, loc]) => `${lang}: ${loc.toLocaleString()}`)
      .join(', ');

    metrics.push({
      category: 'Code Quality & Testing',
      name: 'Total Lines of Code',
      value: totalLOC.toLocaleString(),
      targetValue: 'Depends on project',
      status: totalLOC > 50000 ? 'warning' : totalLOC > 100000 ? 'critical' : 'good',
      description: `Non-empty lines across ${sourceFileCount} files. Breakdown: ${topLanguages}. Large codebases need proportionally more tests and documentation.`,
    });

    // Error handling coverage
    const errorHandlingFiles = sourceFiles.filter(f =>
      f.content.includes('try') && f.content.includes('catch')
    ).length;
    const errorHandleRatio = sourceFileCount > 0 ? (errorHandlingFiles / sourceFileCount * 100).toFixed(1) : 0;

    metrics.push({
      category: 'Code Quality & Testing',
      name: 'Error Handling Coverage',
      value: `${errorHandleRatio}%`,
      targetValue: '80%',
      status: Number(errorHandleRatio) >= 80 ? 'excellent' : Number(errorHandleRatio) >= 60 ? 'good' : Number(errorHandleRatio) >= 30 ? 'warning' : 'critical',
      description: `${errorHandlingFiles}/${sourceFileCount} files have try/catch blocks. Unhandled exceptions crash applications and leak sensitive error details.`,
    });

    // TypeScript strict mode
    const tsconfigFile = context.files.find(f => f.path === 'tsconfig.json' || f.path.endsWith('/tsconfig.json'));
    if (tsconfigFile) {
      const hasStrict = tsconfigFile.content.includes('"strict": true') || tsconfigFile.content.includes('"strict":true');
      metrics.push({
        category: 'Code Quality & Testing',
        name: 'TypeScript Strict Mode',
        value: hasStrict ? 'Enabled' : 'Disabled',
        targetValue: 'Enabled',
        status: hasStrict ? 'excellent' : 'warning',
        description: hasStrict
          ? 'TypeScript strict mode catches type errors at compile time, preventing runtime bugs.'
          : 'Strict mode is disabled — you may miss null checks, implicit anys, and type coercion bugs. Enable "strict": true in tsconfig.json.',
      });
    }

    // Code complexity
    const complexFiles = sourceFiles.filter(f => {
      const functionCount = (f.content.match(/function\s|const\s+\w+\s*=\s*(?:async\s*)?\(/g) || []).length;
      return functionCount > 20;
    });

    metrics.push({
      category: 'Code Quality & Testing',
      name: 'Code Complexity',
      value: `${complexFiles.length} complex file(s)`,
      targetValue: `<${Math.max(1, Math.ceil(sourceFileCount / 5))}`,
      status: complexFiles.length > sourceFileCount / 3 ? 'critical' : complexFiles.length > sourceFileCount / 5 ? 'warning' : 'good',
      description: `Files with >20 functions/handlers: ${complexFiles.length > 0 ? complexFiles.map(f => f.path).slice(0, 3).join(', ') : 'none'}. Complex files are harder to test, review, and maintain.`,
    });

    // ─────── DEPENDENCIES & SUPPLY CHAIN ───────────
    const packageFile = context.files.find(f => f.path === 'package.json');
    let prodDepCount = 0;
    let devDepCount = 0;
    let depNames: string[] = [];

    if (packageFile) {
      try {
        const pkg = JSON.parse(packageFile.content);
        prodDepCount = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;
        devDepCount = pkg.devDependencies ? Object.keys(pkg.devDependencies).length : 0;
        depNames = pkg.dependencies ? Object.keys(pkg.dependencies) : [];
      } catch {
        // JSON parse failed — count manually
        const depSection = packageFile.content.match(/"dependencies"\s*:\s*\{([^}]*)\}/);
        const devDepSection = packageFile.content.match(/"devDependencies"\s*:\s*\{([^}]*)\}/);
        prodDepCount = depSection ? (depSection[1].match(/"/g) || []).length / 4 : 0;
        devDepCount = devDepSection ? (devDepSection[1].match(/"/g) || []).length / 4 : 0;
      }
    }

    const totalDeps = prodDepCount + devDepCount;
    metrics.push({
      category: 'Dependencies & Supply Chain',
      name: 'Dependency Count',
      value: `${prodDepCount} production, ${devDepCount} dev`,
      targetValue: '<30 production',
      status: prodDepCount > 50 ? 'critical' : prodDepCount > 30 ? 'warning' : 'good',
      description: `${totalDeps} total packages. Each dependency is a potential security risk and increases bundle size. Audit regularly with \`npm audit\`.`,
    });

    // Lock file check
    const hasLockFile = context.files.some(f =>
      f.path === 'package-lock.json' || f.path === 'yarn.lock' || f.path === 'pnpm-lock.yaml'
    );
    metrics.push({
      category: 'Dependencies & Supply Chain',
      name: 'Lock File Present',
      value: hasLockFile ? 'Yes' : 'No',
      targetValue: 'Yes',
      status: hasLockFile ? 'excellent' : 'critical',
      description: hasLockFile
        ? 'Lock file ensures deterministic installs across all environments.'
        : 'No lock file found! Builds are non-deterministic — different machines may install different dependency versions, causing subtle bugs.',
    });

    // Linting configuration
    const hasLinting = context.files.some(f =>
      f.path.includes('.eslintrc') || f.path.includes('eslint.config') ||
      f.path.includes('.prettierrc') || f.path.includes('.pylintrc') ||
      f.path.includes('biome.json')
    );
    metrics.push({
      category: 'Dependencies & Supply Chain',
      name: 'Linting Configuration',
      value: hasLinting ? 'Configured' : 'Not found',
      targetValue: 'Configured',
      status: hasLinting ? 'good' : 'warning',
      description: hasLinting
        ? 'Code linting enforces consistent style and catches common bugs automatically.'
        : 'No linting config found. Add ESLint, Prettier, or Biome to enforce code quality standards automatically.',
    });

    // ─────── CI/CD & AUTOMATION ───────────
    const hasCICD = context.files.some(f =>
      f.path.includes('.github/workflows') || f.path.includes('.gitlab-ci') ||
      f.path.includes('Jenkinsfile') || f.path.includes('.circleci') ||
      f.path.includes('azure-pipelines') || f.path.includes('.travis.yml')
    );
    metrics.push({
      category: 'CI/CD & Automation',
      name: 'CI/CD Pipeline',
      value: hasCICD ? 'Configured' : 'Not found',
      targetValue: 'Configured',
      status: hasCICD ? 'excellent' : 'warning',
      description: hasCICD
        ? 'Automated CI/CD pipeline runs tests and deployments on every push.'
        : 'No CI/CD pipeline detected. Set up GitHub Actions, GitLab CI, or similar to automate testing and deployment.',
    });

    // Docker/containerization
    const hasDocker = context.files.some(f =>
      f.path === 'Dockerfile' || f.path === 'docker-compose.yml' || f.path === 'docker-compose.yaml' ||
      f.path.endsWith('/Dockerfile')
    );
    metrics.push({
      category: 'CI/CD & Automation',
      name: 'Containerization',
      value: hasDocker ? 'Docker configured' : 'Not containerized',
      targetValue: 'Docker',
      status: hasDocker ? 'good' : 'warning',
      description: hasDocker
        ? 'Docker ensures consistent runtime environments across dev, staging, and production.'
        : 'No Dockerfile found. Containerization improves deployment reliability and environment consistency.',
    });

    // ─────── DOCUMENTATION & MAINTAINABILITY ───────────
    const readmeFile = context.files.find(f => f.path.toLowerCase() === 'readme.md');
    const readmeLength = readmeFile ? readmeFile.content.length : 0;
    const readmeQuality = readmeLength > 2000 ? 'Comprehensive' : readmeLength > 500 ? 'Basic' : readmeLength > 0 ? 'Minimal' : 'Missing';
    const docFiles = context.files.filter(f =>
      (f.path.toLowerCase().includes('doc') || f.path.endsWith('.md')) &&
      !f.path.includes('node_modules')
    ).length;

    metrics.push({
      category: 'Documentation & Maintainability',
      name: 'Documentation Quality',
      value: `${readmeQuality} README, ${docFiles} doc file(s)`,
      targetValue: 'Comprehensive + >3 docs',
      status: readmeLength > 2000 && docFiles >= 3 ? 'excellent' : readmeLength > 500 ? 'good' : readmeLength > 0 ? 'warning' : 'critical',
      description: `README: ${readmeLength.toLocaleString()} chars. A comprehensive README should include: project purpose, installation, usage examples, API docs, and contributing guidelines.`,
    });

    // Average file size
    const totalSourceSize = sourceFiles.reduce((sum, f) => sum + f.size, 0);
    const avgFileSize = sourceFileCount > 0 ? (totalSourceSize / sourceFileCount / 1024).toFixed(1) : 0;

    metrics.push({
      category: 'Documentation & Maintainability',
      name: 'Average File Size',
      value: `${avgFileSize} KB`,
      targetValue: '<50 KB',
      status: Number(avgFileSize) > 100 ? 'critical' : Number(avgFileSize) > 50 ? 'warning' : 'good',
      description: `Average across ${sourceFileCount} files. Files >100KB are hard to navigate and review. Split large files into focused modules.`,
    });

    // Code organization
    const topLevelDirs = new Set(
      context.files
        .filter(f => !f.path.includes('node_modules') && f.path.includes('/'))
        .map(f => f.path.split('/')[0])
    );
    const hasModularStructure = topLevelDirs.size >= 3;

    metrics.push({
      category: 'Documentation & Maintainability',
      name: 'Code Organization',
      value: `${topLevelDirs.size} top-level directories`,
      targetValue: '≥3 directories',
      status: hasModularStructure ? 'good' : 'warning',
      description: `Directories: ${[...topLevelDirs].slice(0, 6).join(', ')}${topLevelDirs.size > 6 ? '...' : ''}. Well-organized projects separate concerns (src, tests, config, docs).`,
    });

    // ─────── MODERN PRACTICES ───────────
    const asyncFiles = sourceFiles.filter(f =>
      f.content.includes('async') && f.content.includes('await')
    ).length;
    const asyncRatio = sourceFileCount > 0 ? (asyncFiles / sourceFileCount * 100).toFixed(1) : 0;

    metrics.push({
      category: 'Modern Practices',
      name: 'Async/Await Adoption',
      value: `${asyncRatio}%`,
      targetValue: '>70%',
      status: Number(asyncRatio) >= 70 ? 'excellent' : Number(asyncRatio) >= 40 ? 'good' : 'warning',
      description: `${asyncFiles}/${sourceFileCount} files use async/await. Modern async patterns improve readability over callbacks and .then() chains.`,
    });

    const primaryLanguage = context.repoInfo.language || 'Unknown';
    const modernLanguages = ['TypeScript', 'Python', 'Go', 'Rust', 'Kotlin', 'Swift'];
    metrics.push({
      category: 'Modern Practices',
      name: 'Primary Technology',
      value: primaryLanguage,
      targetValue: 'Type-safe language',
      status: modernLanguages.includes(primaryLanguage) ? 'good' : primaryLanguage === 'JavaScript' ? 'warning' : 'warning',
      description: primaryLanguage === 'JavaScript'
        ? 'JavaScript lacks compile-time type safety. Consider migrating to TypeScript for better maintainability and fewer runtime errors.'
        : `${primaryLanguage} is a ${modernLanguages.includes(primaryLanguage) ? 'modern, type-safe' : 'capable'} language.`,
    });

    // ─────── COMMUNITY & ACTIVITY ───────────
    metrics.push({
      category: 'Community & Activity',
      name: 'GitHub Stars',
      value: context.repoInfo.stars || 0,
      targetValue: '100+',
      status: (context.repoInfo.stars || 0) >= 100 ? 'excellent' : (context.repoInfo.stars || 0) >= 10 ? 'good' : 'warning',
      description: 'Stars reflect community interest. Promote on Reddit, HN, and dev communities to increase visibility.',
    });

    metrics.push({
      category: 'Community & Activity',
      name: 'Forks',
      value: context.repoInfo.forks || 0,
      targetValue: '10+',
      status: (context.repoInfo.forks || 0) >= 10 ? 'excellent' : (context.repoInfo.forks || 0) >= 1 ? 'good' : 'warning',
      description: 'Forks indicate active community contributions. Add a CONTRIBUTING.md to encourage contributions.',
    });

    // Environment configuration
    const envFiles = context.files.filter(f =>
      f.path.includes('.env') && !f.path.includes('node_modules')
    ).length;
    const configFiles = context.files.filter(f =>
      (f.path.includes('config') || f.path.includes('.env')) && !f.path.includes('node_modules')
    ).length;

    metrics.push({
      category: 'Modern Practices',
      name: 'Configuration Management',
      value: `${configFiles} config files, ${envFiles} env files`,
      targetValue: '≥2 config files',
      status: configFiles >= 2 ? 'good' : 'warning',
      description: configFiles >= 2
        ? 'Configuration is externalized properly, enabling easy deployment across environments.'
        : 'Limited configuration files. Use .env files and config modules for environment-specific settings.',
    });

    return metrics;
  }

  private async getGroqInsight(metric: ProjectMetric): Promise<string> {
    try {
      const prompt = `You are a software engineering metrics expert. Analyze this project metric:

Metric: ${metric.name}
Category: ${metric.category}
Current Value: ${metric.value}
Target Value: ${metric.targetValue}
Status: ${metric.status}
Description: ${metric.description}

Provide a brief, actionable insight (2-3 sentences). Include:
1. What this metric reveals about project health
2. One specific, concrete action to improve it

Be technical and practical. Start with "Insight: "`;

      const message = await this.groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });

      return message.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Groq API error:', error);
      return '';
    }
  }

  protected async execute(input: unknown): Promise<ProjectMetric[]> {
    const context = input as RepositoryContext;

    this.updateStatus('processing', 30, 'Calculating project metrics...');
    const metrics = this.calculateMetrics(context);

    this.updateStatus('processing', 60, 'Generating AI insights...');

    // Generate insights for ALL warning/critical metrics (not just top 3)
    const needsInsight = metrics.filter(m =>
      m.status === 'critical' || m.status === 'warning'
    );

    for (let i = 0; i < needsInsight.length; i++) {
      this.updateStatus('processing', 60 + Math.round((i / needsInsight.length) * 35), `AI insight ${i + 1}/${needsInsight.length}...`);
      needsInsight[i].groqInsight = await this.getGroqInsight(needsInsight[i]);
    }

    this.updateStatus('processing', 100, 'Complete');
    return metrics;
  }
}
