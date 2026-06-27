/**
 * RepoMetadataExtractor - Extracts real repository metadata to prevent hallucinations
 * Priorities: Actual files > README > Package.json > Heuristics > Defaults
 */
import { RepositoryContext } from '@/lib/types';

export interface RealRepoMetadata {
  // From README or actual docs
  purpose: string;
  problems: string[];
  targetUsers: string[];
  keyFeatures: string[];

  // From actual code analysis
  components: {
    name: string;
    purpose: string;
    path: string;
  }[];

  // From package.json scripts
  setupSteps: string[];
  devScript: string | null;
  buildScript: string | null;
  testScript: string | null;

  // From file structure
  projectType: 'monolith' | 'monorepo' | 'library' | 'api' | 'unknown';
  hasDocker: boolean;
  hasDocs: boolean;
  hasTests: boolean;
  hasCICD: boolean;

  // From imports and exports
  mainEntrypoint: string | null;
  publicApis: string[];
}

export class RepoMetadataExtractor {
  /**
   * Extract real metadata from repository files
   */
  static extract(context: RepositoryContext): RealRepoMetadata {
    return {
      purpose: this.extractPurpose(context),
      problems: this.extractProblems(context),
      targetUsers: this.extractTargetUsers(context),
      keyFeatures: this.extractKeyFeatures(context),
      components: this.extractActualComponents(context),
      setupSteps: this.extractSetupSteps(context),
      devScript: this.extractScript(context, 'dev'),
      buildScript: this.extractScript(context, 'build'),
      testScript: this.extractScript(context, 'test'),
      projectType: this.detectProjectType(context),
      hasDocker: context.files.some(f => f.path === 'Dockerfile'),
      hasDocs: context.files.some(f => f.path.includes('README') || f.path.includes('docs/')),
      hasTests: context.files.some(f => f.path.includes('.test') || f.path.includes('.spec')),
      hasCICD: context.files.some(f => f.path.includes('.github/workflows') || f.path.includes('.gitlab-ci') || f.path.includes('Jenkinsfile')),
      mainEntrypoint: this.findMainEntrypoint(context),
      publicApis: this.extractPublicAPIs(context),
    };
  }

  /**
   * Extract purpose from README, package.json, or git info
   */
  private static extractPurpose(context: RepositoryContext): string {
    // 1. Try README
    const readme = context.files.find(f => f.path.match(/^README(\.|$)/i));
    if (readme?.content) {
      const lines = readme.content.split('\n');
      const descMatch = lines.slice(0, 20).join('\n').match(/^#+\s+(?:About|Overview)?\n+([\s\S]*?)(?=\n#+|$)/i);
      if (descMatch?.[1]) {
        return descMatch[1].trim().split('\n')[0].trim();
      }
      // First meaningful line after header
      const firstContent = lines.find(l => l.trim() && !l.startsWith('#'));
      if (firstContent) return firstContent.slice(0, 150);
    }

    // 2. Try package.json description
    const pkg = context.files.find(f => f.path === 'package.json');
    if (pkg?.content) {
      try {
        const parsed = JSON.parse(pkg.content);
        if (parsed.description) return parsed.description;
      } catch {}
    }

    // 3. Fall back to repo description, then generic
    return context.repoInfo.description ||
           `A ${context.repoInfo.language || 'software'} project built by ${context.repoInfo.owner}`;
  }

  /**
   * Extract specific problems this repo solves
   */
  private static extractProblems(context: RepositoryContext): string[] {
    const problems: string[] = [];

    // Look in README for "Problems", "Motivation", "Why", "Solves"
    const readme = context.files.find(f => f.path.match(/^README(\.|$)/i));
    if (readme?.content) {
      const sections = readme.content.match(/(?:###|##)\s+(Problems?|Motivation|Why|Solves)[\s\S]*?(?=(?:##|###)|$)/gi);
      if (sections) {
        sections.forEach(section => {
          const lines = section.split('\n').slice(1, 5);
          lines.forEach(line => {
            const clean = line.replace(/^[-*]\s/, '').trim();
            if (clean && !clean.startsWith('#')) problems.push(clean);
          });
        });
      }
    }

    // If not found, infer from tech stack and structure
    if (problems.length === 0) {
      if (context.files.some(f => f.path.includes('api'))) problems.push('API Development');
      if (context.files.some(f => f.path.includes('database'))) problems.push('Data Management');
      if (context.files.some(f => f.path.includes('auth'))) problems.push('Authentication & Security');
      if (context.files.some(f => f.path.includes('ui') || f.path.includes('component'))) problems.push('UI Component Management');
    }

    return problems.slice(0, 4);
  }

  /**
   * Extract target users/stakeholders from actual code
   */
  private static extractTargetUsers(context: RepositoryContext): string[] {
    const users: Set<string> = new Set();

    // Check what kind of project this is
    const readme = context.files.find(f => f.path.match(/^README(\.|$)/i));
    const readmeText = readme?.content || '';

    if (readmeText.toLowerCase().includes('developer') || context.files.some(f => f.path.includes('lib'))) {
      users.add('Developers');
    }
    if (readmeText.toLowerCase().includes('cli') || context.files.some(f => f.path.includes('bin') || f.path.includes('command'))) {
      users.add('DevOps Engineers');
    }
    if (readmeText.toLowerCase().includes('api') || context.files.some(f => f.path.includes('api') || f.path.includes('endpoint'))) {
      users.add('Backend Engineers');
    }
    if (context.files.some(f => f.path.includes('src/') && (f.path.includes('App') || f.path.includes('ui')))) {
      users.add('Frontend Developers');
      users.add('End Users');
    }
    if (readmeText.toLowerCase().includes('business') || readmeText.toLowerCase().includes('enterprise')) {
      users.add('Business Stakeholders');
    }

    return Array.from(users).slice(0, 4);
  }

  /**
   * Extract key features from README or code
   */
  private static extractKeyFeatures(context: RepositoryContext): string[] {
    const features: string[] = [];

    const readme = context.files.find(f => f.path.match(/^README(\.|$)/i));
    if (readme?.content) {
      // Look for "Features" section
      const match = readme.content.match(/##\s+Features[\s\S]*?(?=##|$)/i);
      if (match) {
        const lines = match[0].split('\n').slice(1, 8);
        lines.forEach(line => {
          const clean = line.replace(/^[-*]\s/, '').trim();
          if (clean && !clean.startsWith('#') && clean.length > 5) {
            features.push(clean);
          }
        });
      }
    }

    return features.slice(0, 5);
  }

  /**
   * Extract actual components from directory structure and imports
   */
  private static extractActualComponents(context: RepositoryContext): RealRepoMetadata['components'] {
    const components: RealRepoMetadata['components'] = [];
    const seen = new Set<string>();

    // Look for common patterns
    const patterns = [
      { path: 'src/api', name: 'API Layer', purpose: 'REST/GraphQL endpoints and request handling' },
      { path: 'src/services', name: 'Services', purpose: 'Business logic and external integrations' },
      { path: 'src/models', name: 'Data Models', purpose: 'Data structures and schemas' },
      { path: 'src/components', name: 'UI Components', purpose: 'React/Vue components' },
      { path: 'src/utils', name: 'Utilities', purpose: 'Helper functions and utilities' },
      { path: 'src/hooks', name: 'Custom Hooks', purpose: 'React hooks for state management' },
      { path: 'src/store', name: 'State Management', purpose: 'Redux/Zustand/MobX store' },
      { path: 'src/middleware', name: 'Middleware', purpose: 'Request/response middleware' },
      { path: 'src/database', name: 'Database Layer', purpose: 'ORM/query builders' },
      { path: 'tests', name: 'Tests', purpose: 'Unit and integration tests' },
    ];

    patterns.forEach(pattern => {
      if (context.files.some(f => f.path.startsWith(pattern.path)) && !seen.has(pattern.name)) {
        components.push({
          name: pattern.name,
          purpose: pattern.purpose,
          path: pattern.path,
        });
        seen.add(pattern.name);
      }
    });

    // If not much found, infer from files
    if (components.length < 2) {
      const hasFrontend = context.files.some(f => f.path.match(/\.(tsx?|jsx?)$/) && (f.path.includes('component') || f.path.includes('page')));
      const hasBackend = context.files.some(f => f.path.match(/\.(ts|js)$/) && (f.path.includes('api') || f.path.includes('route') || f.path.includes('handler')));
      const hasDB = context.files.some(f => f.path.match(/\.(ts|js|sql)$/) && (f.path.includes('model') || f.path.includes('schema') || f.path.includes('database')));

      if (hasFrontend) components.push({ name: 'Frontend', purpose: 'User interface', path: 'src/' });
      if (hasBackend) components.push({ name: 'Backend', purpose: 'Business logic and APIs', path: 'src/' });
      if (hasDB) components.push({ name: 'Database', purpose: 'Data persistence', path: 'src/' });
    }

    return components.slice(0, 5);
  }

  /**
   * Extract actual setup steps from package.json scripts
   */
  private static extractSetupSteps(context: RepositoryContext): string[] {
    const steps: string[] = [];

    const pkg = context.files.find(f => f.path === 'package.json');
    if (pkg?.content) {
      try {
        const parsed = JSON.parse(pkg.content);
        steps.push('npm install');

        if (parsed.scripts?.build) steps.push('npm run build');
        if (parsed.scripts?.dev) steps.push('npm run dev');
        if (parsed.scripts?.start) steps.push('npm start');
      } catch {}
    }

    // Check for Python
    if (context.files.some(f => f.path === 'requirements.txt' || f.path === 'setup.py')) {
      steps.length = 0; // Reset
      steps.push('pip install -r requirements.txt');
      if (context.files.some(f => f.path === 'setup.py')) steps.push('python setup.py develop');
    }

    return steps.length > 0 ? steps : ['Check README.md for setup instructions'];
  }

  /**
   * Extract specific script content
   */
  private static extractScript(context: RepositoryContext, scriptName: string): string | null {
    const pkg = context.files.find(f => f.path === 'package.json');
    if (!pkg?.content) return null;

    try {
      const parsed = JSON.parse(pkg.content);
      return parsed.scripts?.[scriptName] || null;
    } catch {
      return null;
    }
  }

  /**
   * Detect project type
   */
  private static detectProjectType(context: RepositoryContext): RealRepoMetadata['projectType'] {
    const fileCount = context.files.length;

    // Check for monorepo
    if (context.files.some(f => f.path === 'lerna.json' || f.path === 'pnpm-workspace.yaml' || f.path === 'nx.json')) {
      return 'monorepo';
    }

    // Check for library
    if (context.files.some(f => f.path === 'lib/' || f.path === 'dist/') &&
        context.files.some(f => f.path === 'package.json') &&
        fileCount < 50) {
      return 'library';
    }

    // Check for API
    if (context.files.some(f => f.path.includes('api/') || f.path.includes('routes/'))) {
      return 'api';
    }

    return 'monolith';
  }

  /**
   * Find main entry point
   */
  private static findMainEntrypoint(context: RepositoryContext): string | null {
    // Common patterns
    const candidates = ['src/index.ts', 'src/index.js', 'index.ts', 'index.js', 'src/main.ts', 'src/app.ts'];
    return candidates.find(c => context.files.some(f => f.path === c)) || null;
  }

  /**
   * Extract public APIs from code analysis
   */
  private static extractPublicAPIs(context: RepositoryContext): string[] {
    const apis: Set<string> = new Set();

    // Look for route definitions
    context.files.forEach(f => {
      if (f.language === 'TypeScript' || f.language === 'JavaScript') {
        // Simple pattern matching
        const routes = f.content.match(/(?:app\.|router\.)(?:get|post|put|delete|patch)\(['"](\/[\w\/-]*)/g) || [];
        routes.forEach(route => {
          const path = route.match(/['"`](\/[\w\/-]*)/)?.[1];
          if (path) apis.add(path);
        });
      }
    });

    return Array.from(apis).slice(0, 10);
  }
}
