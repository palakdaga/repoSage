import { BaseAgent } from './BaseAgent';
import { RepositoryContext, DiagramData } from '@/lib/types';
import { CodeParser } from '@/lib/services/parser';

export class DiagramAgent extends BaseAgent {
  constructor() {
    super('diagram', 'Diagram Agent', { timeoutMs: 60000 });
  }

  protected async initialize(): Promise<void> {}

  protected async execute(input: unknown): Promise<DiagramData[]> {
    const context = input as RepositoryContext;
    const diagrams: DiagramData[] = [];

    // 1. Architecture diagram
    this.updateStatus('processing', 20, 'Generating architecture diagram...');
    diagrams.push(this.generateArchitectureDiagram(context));

    // 2. Dependency graph
    this.updateStatus('processing', 50, 'Building dependency graph...');
    diagrams.push(this.generateDependencyGraph(context));

    // 3. Component diagram
    this.updateStatus('processing', 70, 'Creating component diagram...');
    diagrams.push(this.generateComponentDiagram(context));

    // 4. Flow diagram
    this.updateStatus('processing', 90, 'Creating flow diagram...');
    diagrams.push(this.generateFlowDiagram(context));

    return diagrams;
  }

  private generateArchitectureDiagram(ctx: RepositoryContext): DiagramData {
    const dirs = new Map<string, number>();
    ctx.files.forEach((f) => {
      const top = f.path.split(/[/\\]/)[0];
      if (top) dirs.set(top, (dirs.get(top) || 0) + 1);
    });

    let mermaid = 'graph TB\n';
    mermaid += '  ROOT["' + this.sanitize(ctx.repoInfo.name) + '"] --> |contains| DIRS\n';
    mermaid += '  DIRS["Directories"]\n';

    const sortedDirs = [...dirs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    sortedDirs.forEach(([dir, count], i) => {
      const nodeId = `DIR${i}`;
      mermaid += `  DIRS --> ${nodeId}["${this.sanitize(dir)}/ (${count} files)"]\n`;
    });

    // Add language distribution
    const langs = new Map<string, number>();
    ctx.files.forEach((f) => {
      if (f.language !== 'unknown') langs.set(f.language, (langs.get(f.language) || 0) + 1);
    });

    mermaid += '  ROOT --> LANGS["Languages"]\n';
    [...langs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([lang, count], i) => {
      mermaid += `  LANGS --> LANG${i}["${this.sanitize(lang)} (${count})"]\n`;
    });

    return {
      id: 'architecture',
      title: 'Project Architecture',
      type: 'architecture',
      mermaidCode: mermaid,
    };
  }

  private generateDependencyGraph(ctx: RepositoryContext): DiagramData {
    const deps = new Map<string, Set<string>>();
    const maxFiles = 15;
    const sortedFiles = [...ctx.files].sort((a, b) => b.size - a.size).slice(0, maxFiles);

    for (const file of sortedFiles) {
      const imports = CodeParser.extractImports(file.content, file.language);
      const shortName = file.name;
      if (!deps.has(shortName)) deps.set(shortName, new Set());

      for (const imp of imports) {
        // Extract module name from import statement
        const match = imp.match(/from\s+['"]([^'"]+)['"]/) || imp.match(/require\(['"]([^'"]+)['"]\)/) || imp.match(/import\s+(\w+)/);
        if (match) {
          const mod = match[1].split('/').pop() || match[1];
          deps.get(shortName)!.add(mod);
        }
      }
    }

    let mermaid = 'graph LR\n';
    let edgeCount = 0;
    const maxEdges = 30;

    for (const [file, fileDeps] of deps.entries()) {
      for (const dep of fileDeps) {
        if (edgeCount >= maxEdges) break;
        mermaid += `  ${this.nodeId(file)}["${this.sanitize(file)}"] --> ${this.nodeId(dep)}["${this.sanitize(dep)}"]\n`;
        edgeCount++;
      }
    }

    if (edgeCount === 0) {
      mermaid += '  EMPTY["No dependencies detected"]\n';
    }

    return {
      id: 'dependencies',
      title: 'Dependency Graph',
      type: 'dependency',
      mermaidCode: mermaid,
    };
  }

  private generateComponentDiagram(ctx: RepositoryContext): DiagramData {
    const components: Array<{ name: string; type: string; files: number }> = [];
    const groups: Record<string, number> = {};

    ctx.files.forEach((f) => {
      const parts = f.path.split(/[/\\]/);
      const dir = parts.length > 1 ? parts[0] : 'root';
      groups[dir] = (groups[dir] || 0) + 1;
    });

    Object.entries(groups).forEach(([name, files]) => {
      const lower = name.toLowerCase();
      let type = 'Module';
      if (['components', 'pages', 'views'].includes(lower)) type = 'UI';
      else if (['api', 'routes', 'controllers'].includes(lower)) type = 'API';
      else if (['lib', 'utils', 'helpers'].includes(lower)) type = 'Library';
      else if (['services', 'providers'].includes(lower)) type = 'Service';
      else if (['models', 'schemas', 'db'].includes(lower)) type = 'Data';
      else if (['tests', 'test', '__tests__'].includes(lower)) type = 'Test';
      components.push({ name, type, files });
    });

    let mermaid = 'graph TB\n';
    const typeNodes: Record<string, string[]> = {};

    components.sort((a, b) => b.files - a.files).slice(0, 12).forEach((comp, i) => {
      const nodeId = `C${i}`;
      mermaid += `  ${nodeId}["${this.sanitize(comp.name)}/ (${comp.files})"]\n`;
      if (!typeNodes[comp.type]) typeNodes[comp.type] = [];
      typeNodes[comp.type].push(nodeId);
    });

    // Add subgraph grouping by type
    Object.entries(typeNodes).forEach(([type, nodes]) => {
      if (nodes.length > 1) {
        mermaid += `  subgraph ${this.sanitize(type)}\n`;
        nodes.forEach((n) => (mermaid += `    ${n}\n`));
        mermaid += `  end\n`;
      }
    });

    return {
      id: 'components',
      title: 'Component Overview',
      type: 'component',
      mermaidCode: mermaid,
    };
  }

  private generateFlowDiagram(ctx: RepositoryContext): DiagramData {
    const hasAPI = ctx.files.some((f) => f.path.toLowerCase().includes('api') || f.path.toLowerCase().includes('route'));
    const hasUI = ctx.files.some((f) => f.path.toLowerCase().includes('component') || f.path.toLowerCase().includes('page'));
    const hasDB = ctx.files.some((f) => f.content.toLowerCase().includes('database') || f.content.toLowerCase().includes('mongoose') || f.content.toLowerCase().includes('prisma'));
    const hasAuth = ctx.files.some((f) => f.content.toLowerCase().includes('auth') || f.content.toLowerCase().includes('jwt'));

    let mermaid = 'graph LR\n';
    mermaid += '  USER["User"] --> |request| ';

    if (hasUI) {
      mermaid += 'UI["Frontend UI"]\n';
      mermaid += '  UI --> |API call| ';
    }

    if (hasAPI) {
      mermaid += 'API["API Layer"]\n';
      if (hasAuth) {
        mermaid += '  API --> AUTH["Auth Middleware"]\n';
        mermaid += '  AUTH --> LOGIC["Business Logic"]\n';
      } else {
        mermaid += '  API --> LOGIC["Business Logic"]\n';
      }
    } else {
      mermaid += 'LOGIC["Application Logic"]\n';
    }

    if (hasDB) {
      mermaid += '  LOGIC --> DB["Database"]\n';
      mermaid += '  DB --> |data| LOGIC\n';
    }

    mermaid += '  LOGIC --> |response| ';
    mermaid += hasUI ? 'UI\n' : 'USER\n';

    return {
      id: 'flow',
      title: 'Data Flow',
      type: 'flow',
      mermaidCode: mermaid,
    };
  }

  private sanitize(text: string): string {
    return text.replace(/[""<>{}|\\^~`#]/g, '').replace(/\[/g, '(').replace(/\]/g, ')').substring(0, 40);
  }

  private nodeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
  }
}
