import { BaseAgent } from './BaseAgent';
import { RepositoryContext } from '@/lib/types';
import { Groq } from 'groq-sdk';
import { RepoMetadataExtractor } from '@/lib/utils/RepoMetadataExtractor';

export interface ArchitectureAnalysis {
  highlevelOverview: {
    purpose: string;
    problemSolved: string;
    stakeholders: string[];
    userWorkflow: string;
  };
  architecturalPattern: {
    pattern: string;
    rationale: string;
    alternatives: string[];
  };
  repositoryStructure: {
    directory: string[];
    organization: string;
    buildTools: string[];
    monorepoExplanation: string;
  };
  components: {
    name: string;
    description: string;
    technology: string;
    responsibility: string;
  }[];
  techStack: {
    frontend: string[];
    backend: string[];
    database: string[];
    infrastructure: string[];
    messaging: string[];
    other: string[];
  };
  dataFlow: {
    description: string;
    flowDiagram: string;
    apiProtocols: string[];
    asyncProcessing: string;
  };
  dataArchitecture: {
    databaseType: string;
    schema: string;
    dataAccessPattern: string;
    explanation: string;
  };
  deployment: {
    infrastructure: string;
    containerization: string;
    cicdPipeline: string;
    deploymentSteps: string[];
  };
  qualityAttributes: {
    security: string;
    scalability: string;
    performance: string;
    maintainability: string;
    resilience: string;
  };
  architectureDecisions: {
    decision: string;
    rationale: string;
    alternatives: string[];
    tradeoffs: string;
  }[];
  diagramMermaid: string;
  groqAnalysis?: string;
}

export class ArchitectureAnalyzerAgent extends BaseAgent {
  private groq: Groq;

  constructor() {
    super('architecture', 'Architecture Analyzer', { timeoutMs: 90000 });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  protected async initialize(): Promise<void> {}

  private generateDataFlowDescription(metadata: any, techStack: any): string {
    if (metadata.projectType === 'library') {
      return 'Developers import library → Call exported functions → Receive processed results';
    }

    if (metadata.projectType === 'api') {
      return 'Client sends HTTP request → Route handler processes → Database query/external API call → Response serialized → Returned to client';
    }

    if (techStack.frontend.length > 0 && techStack.backend.length > 0) {
      return 'User interaction → Frontend state update → API call to backend → Business logic processing → Database operation → Response to client → UI re-render';
    }

    if (metadata.components.some((c: any) => c.name.toLowerCase().includes('cli'))) {
      return 'Command-line input → Argument parsing → Core logic execution → Output formatting → Display to terminal';
    }

    return techStack.other.includes('GraphQL')
      ? 'Client sends GraphQL query → Schema validation → Resolver execution → Data fetching → Response generation'
      : 'Standard request-response data flow through application layers';
  }

  private generateUserWorkflow(metadata: any, techStack: any): string {
    // Generate realistic workflow based on actual project type
    if (metadata.targetUsers.includes('Frontend Developers')) {
      return 'Users interact with UI components → Frontend state management → API calls to backend → Response processing → UI updates';
    }
    if (metadata.targetUsers.includes('Backend Engineers')) {
      return 'API requests received → Authentication & authorization → Business logic processing → Database operations → Response serialization';
    }
    if (metadata.projectType === 'library') {
      return 'Developers import library → Initialize with config → Call exported functions → Receive processed results';
    }
    return 'Request → Processing → Persistence → Response';
  }

  private getTechForComponent(componentName: string, techStack: any): string {
    const name = componentName.toLowerCase();
    if (name.includes('frontend') || name.includes('ui')) return techStack.frontend.join(', ') || 'Web Framework';
    if (name.includes('backend') || name.includes('api') || name.includes('service')) return techStack.backend.join(', ') || 'Backend Framework';
    if (name.includes('database') || name.includes('data')) return techStack.database.join(', ') || 'Database';
    return 'Multiple';
  }

  private getResponsibility(componentName: string): string {
    const name = componentName.toLowerCase();
    if (name.includes('frontend') || name.includes('ui') || name.includes('component')) return 'User interface, state management, view rendering';
    if (name.includes('api') || name.includes('service')) return 'Business logic, data processing, external integrations';
    if (name.includes('database') || name.includes('data') || name.includes('model')) return 'Data persistence, schemas, migrations';
    if (name.includes('middleware')) return 'Request/response handling, authentication, logging';
    if (name.includes('utility') || name.includes('util')) return 'Helper functions, reusable logic';
    return 'System component responsibility';
  }

  private detectBuildTools(context: RepositoryContext): string[] {
    const tools: Set<string> = new Set();
    const pkg = context.files.find(f => f.path === 'package.json');

    if (pkg?.content) {
      if (pkg.content.includes('webpack')) tools.add('Webpack');
      if (pkg.content.includes('vite')) tools.add('Vite');
      if (pkg.content.includes('babel')) tools.add('Babel');
      if (pkg.content.includes('typescript')) tools.add('TypeScript');
      if (pkg.content.includes('eslint')) tools.add('ESLint');
    }

    if (context.files.some(f => f.path === 'tsconfig.json')) tools.add('TypeScript Compiler');
    if (context.files.some(f => f.path === 'Dockerfile')) tools.add('Docker');

    return Array.from(tools).length > 0 ? Array.from(tools) : ['npm'];
  }

  private generateQualityAttribute(attribute: string, metadata: any): string {
    const isSmallProject = metadata.components.length <= 2;
    const hasTests = metadata.hasTests;
    const hasCICD = metadata.hasCICD;
    const hasDocker = metadata.hasDocker;

    switch (attribute) {
      case 'security':
        return isSmallProject && !hasTests
          ? 'Basic security practices. Manual code review recommended.'
          : 'Input validation and access control implemented. Security testing in place.';

      case 'scalability':
        return metadata.projectType === 'library'
          ? 'Designed as a reusable module for integration into larger applications.'
          : isSmallProject
            ? 'Single-instance deployment suitable for current requirements.'
            : 'Supports horizontal scaling with stateless service architecture.';

      case 'performance':
        return isSmallProject
          ? 'Optimized for simplicity and maintainability over distributed performance.'
          : hasCICD
            ? 'Performance monitoring and optimization in CI/CD pipeline.'
            : 'Performance optimized through code patterns and dependency management.';

      case 'maintainability':
        return isSmallProject
          ? `Well-organized ${metadata.projectType} structure with ${metadata.components.length} main components.`
          : `Modular architecture with ${metadata.components.length}+ components and clear separation of concerns.`;

      case 'resilience':
        return hasCICD && hasTests
          ? 'Error handling with automated testing and automated deployments reduce downtime.'
          : hasTests
            ? 'Error handling and basic recovery mechanisms in place.'
            : 'Error handling present. Manual recovery procedures recommended.';

      default:
        return 'Project-specific implementation.';
    }
  }


  private async analyzeWithGroq(prompt: string, maxTokens: number = 500): Promise<string> {
    try {
      const message = await this.groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      return message.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Groq API error:', error);
      return '';
    }
  }

  private detectTechStack(context: RepositoryContext): {
    frontend: string[];
    backend: string[];
    database: string[];
    infrastructure: string[];
    messaging: string[];
    other: string[];
  } {
    const packageFile = context.files.find(f => f.path === 'package.json')?.content || '';
    const tsconfig = context.files.find(f => f.path === 'tsconfig.json');
    const dockerfile = context.files.find(f => f.path === 'Dockerfile');
    const requirements = context.files.find(f => f.path === 'requirements.txt');

    const tech = {
      frontend: [] as string[],
      backend: [] as string[],
      database: [] as string[],
      infrastructure: [] as string[],
      messaging: [] as string[],
      other: [] as string[],
    };

    // Frontend detection
    if (packageFile.includes('react')) tech.frontend.push('React');
    if (packageFile.includes('vue')) tech.frontend.push('Vue.js');
    if (packageFile.includes('angular')) tech.frontend.push('Angular');
    if (packageFile.includes('next')) tech.frontend.push('Next.js');
    if (packageFile.includes('tailwind')) tech.frontend.push('Tailwind CSS');
    if (tsconfig) tech.frontend.push('TypeScript');

    // Backend detection
    if (packageFile.includes('express')) tech.backend.push('Express.js');
    if (packageFile.includes('fastify')) tech.backend.push('Fastify');
    if (packageFile.includes('nestjs')) tech.backend.push('NestJS');
    if (packageFile.includes('hapi')) tech.backend.push('Hapi');
    if (context.repoInfo.language === 'Python') tech.backend.push('Python');
    if (context.repoInfo.language === 'Go') tech.backend.push('Go');
    if (context.repoInfo.language === 'Java') tech.backend.push('Java');
    if (packageFile.includes('node')) tech.backend.push('Node.js');

    // Database detection
    if (packageFile.includes('mongoose')) tech.database.push('MongoDB');
    if (packageFile.includes('postgresql')) tech.database.push('PostgreSQL');
    if (packageFile.includes('mysql')) tech.database.push('MySQL');
    if (packageFile.includes('dynamodb')) tech.database.push('DynamoDB');
    if (packageFile.includes('redis')) tech.database.push('Redis');
    if (packageFile.includes('firebase')) tech.database.push('Firebase');
    if (packageFile.includes('sequelize')) tech.database.push('SQL (via Sequelize)');
    if (packageFile.includes('prisma')) tech.database.push('PostgreSQL/MySQL (via Prisma)');

    // Infrastructure detection
    if (dockerfile) tech.infrastructure.push('Docker');
    if (context.files.some(f => f.path.includes('kubernetes'))) tech.infrastructure.push('Kubernetes');
    if (packageFile.includes('aws-sdk')) tech.infrastructure.push('AWS');
    if (packageFile.includes('@google-cloud')) tech.infrastructure.push('Google Cloud');
    if (packageFile.includes('azure')) tech.infrastructure.push('Azure');

    // Messaging detection
    if (packageFile.includes('kafka')) tech.messaging.push('Apache Kafka');
    if (packageFile.includes('rabbitmq')) tech.messaging.push('RabbitMQ');
    if (packageFile.includes('bull')) tech.messaging.push('Bull (Redis-based Queue)');
    if (packageFile.includes('amqp')) tech.messaging.push('AMQP');

    // Other
    if (packageFile.includes('graphql')) tech.other.push('GraphQL');
    if (packageFile.includes('rest') || context.files.some(f => f.path.includes('routes'))) tech.other.push('REST API');
    if (packageFile.includes('websocket')) tech.other.push('WebSockets');
    if (packageFile.includes('grpc')) tech.other.push('gRPC');
    if (packageFile.includes('swagger')) tech.other.push('Swagger/OpenAPI');

    return tech;
  }

  private detectRepositoryStructure(context: RepositoryContext): string[] {
    const dirs = new Set<string>();
    context.files.forEach(f => {
      const parts = f.path.split('/');
      if (parts.length >= 2) {
        dirs.add(parts[0]);
      }
    });
    return Array.from(dirs).sort();
  }

  private generateDataFlowDiagram(metadata: any, techStack: any): string {
    // For libraries - show module/function flow
    if (metadata.projectType === 'library') {
      return `graph TD
    User["👤 Developer"]
    Import["📦 Import<br/>Library Module"]
    Config["⚙️ Configuration"]
    Exec["▶️ Function Call"]
    Logic["🔧 Core Logic"]
    Result["📊 Return Results"]

    User -->|"Use"| Import
    Import -->|"Setup"| Config
    Config -->|"Execute"| Exec
    Exec -->|"Process"| Logic
    Logic -->|"Output"| Result
    Result -->|"Use"| User`;
    }

    // For CLI tools - show command-line flow
    if (metadata.components.some((c: any) => c.name.toLowerCase().includes('cli'))) {
      return `graph TD
    User["👤 User"]
    CLI["⌨️ Command Line<br/>Input"]
    Parse["📝 Parse Arguments"]
    Logic["🔧 Core Logic"]
    Output["🖨️ Output<br/>Formatting"]
    Display["📺 Display Results"]

    User -->|"Execute"| CLI
    CLI -->|"Parse"| Parse
    Parse -->|"Process"| Logic
    Logic -->|"Format"| Output
    Output -->|"Show"| Display`;
    }

    // For web/API projects - show standard web flow
    const hasGraphQL = techStack.other.includes('GraphQL');
    const hasRest = techStack.other.includes('REST API');
    const hasWebSockets = techStack.other.includes('WebSockets');

    return `graph TD
    User["👤 User/Client"]
    FE["🖥️ Frontend<br/>${techStack.frontend.join('<br/>')  || 'SPA'}"]

    ${hasWebSockets ? 'WS["🔌 WebSocket<br/>Bi-directional"]' : ''}

    ${hasRest ? 'REST["📡 REST API<br/>HTTP/HTTPS"]' : ''}
    ${hasGraphQL ? 'GQL["📡 GraphQL<br/>Query Layer"]' : ''}

    BE["⚙️ Backend<br/>${techStack.backend.join('<br/>')}"]

    ${techStack.messaging.length > 0 ? `MSG["📨 Message Queue<br/>${techStack.messaging.join('<br/>')}"]` : ''}

    ${techStack.database.length > 0 ? `DB["🗄️ Database<br/>${techStack.database.join('<br/>')}"]` : ''}

    Cache["💾 Cache<br/>Redis/In-Memory"]

    User -->|"Interact"| FE
    FE -->|"${hasRest ? 'REST' : 'Request'}"| ${hasRest ? 'REST' : 'BE'}
    ${hasGraphQL ? `FE -->|"Query/Mutation"| GQL\n    GQL -->| | BE` : ''}
    ${hasWebSockets ? `FE <-->|"Real-time"| WS\n    WS --> BE` : ''}
    ${hasRest || hasGraphQL ? `${hasRest ? 'REST' : 'GQL'} -->| | BE` : ''}
    ${techStack.database.length > 0 ? `BE -->|"Read/Write"| DB` : ''}
    BE -->|"Cache"| Cache
    ${techStack.messaging.length > 0 ? `BE -->|"Async Events"| MSG\n    MSG -->|"Consume"| BE` : ''}`;
  }

  protected async execute(input: unknown): Promise<ArchitectureAnalysis> {
    const context = input as RepositoryContext;
    this.updateStatus('processing', 10, 'Analyzing high-level overview...');

    // Extract real metadata from repository files (prevents hallucinations)
    const metadata = RepoMetadataExtractor.extract(context);

    const techStack = this.detectTechStack(context);
    const dirs = this.detectRepositoryStructure(context);

    // High-level overview analysis
    this.updateStatus('processing', 20, 'Analyzing architectural pattern...');
    const patternAnalysis = await this.analyzeWithGroq(
      `Analyze this repository's actual architecture:

Repository: ${context.repoInfo.name}
Tech Stack: ${JSON.stringify(techStack)}
Project Type: ${metadata.projectType}
Key Components Found: ${metadata.components.map(c => c.name).join(', ')}
Files Count: ${context.files.length}
Has Tests: ${metadata.hasTests}
Has Docker: ${metadata.hasDocker}
Has CI/CD: ${metadata.hasCICD}

Based on these REAL characteristics (not assumptions), identify:
1. The actual architectural pattern (Monolith/Microservices/Serverless/Layered/Event-Driven/Library)
2. Why this pattern makes sense given the project characteristics
3. What alternatives could have been used

Respond ONLY in JSON: {"pattern":"...", "rationale":"...", "alternatives":["...", "..."]}`,
      300
    );

    this.updateStatus('processing', 35, 'Analyzing data flow...');
    const dataFlowAnalysis = await this.analyzeWithGroq(
      `For an application with this tech stack: ${JSON.stringify(techStack)}

Describe:
1. How data flows from user to database and back
2. API communication protocols used
3. Any asynchronous processing

Respond in JSON: {"description":"...", "apiProtocols":["..."], "asyncProcessing":"..."}`,
      250
    );

    this.updateStatus('processing', 50, 'Analyzing data architecture...');
    const dbAnalysis = await this.analyzeWithGroq(
      `Given databases: ${techStack.database.join(', ')}
Language: ${context.repoInfo.language}

Describe:
1. Expected database type (Relational/NoSQL/Graph/Time-series)
2. High-level schema design patterns
3. Data access patterns likely used

Respond in JSON: {"databaseType":"...", "schema":"...", "dataAccessPattern":"..."}`,
      300
    );

    this.updateStatus('processing', 65, 'Analyzing deployment & infrastructure...');
    const deploymentAnalysis = await this.analyzeWithGroq(
      `Tech stack: ${JSON.stringify(techStack)}

Describe likely:
1. Infrastructure (Cloud provider/On-premise/Hybrid)
2. Containerization approach
3. CI/CD pipeline strategy
4. Deployment steps

Respond in JSON: {"infrastructure":"...", "containerization":"...", "cicdPipeline":"...", "deploymentSteps":["...", "..."]}`,
      300
    );

    this.updateStatus('processing', 80, 'Analyzing quality attributes...');
    const qualityAnalysis = await this.analyzeWithGroq(
      `For this actual architecture, describe how it handles these quality attributes:

Tech Stack: ${JSON.stringify(techStack)}
Project Type: ${metadata.projectType}
Has Tests: ${metadata.hasTests}
Has Docker: ${metadata.hasDocker}
Key Components: ${metadata.components.map(c => c.name).join(', ')}

Provide 1-2 sentences for each:
1. Security - How does the architecture protect data? What's the auth model?
2. Scalability - Can it handle growth? Horizontal/Vertical?
3. Performance - What optimizations are visible? Caching? Async?
4. Maintainability - Code organization? Documentation level?
5. Resilience - Error handling? Retry logic? Health checks?

Respond ONLY in JSON: {"security":"...", "scalability":"...", "performance":"...", "maintainability":"...", "resilience":"..."}`,
      350
    );

    const flowDiagram = this.generateDataFlowDiagram(metadata, techStack);

    // Parse Groq responses
    let pattern = { pattern: 'Layered Architecture', rationale: 'Balanced approach for scalability and maintainability', alternatives: ['Microservices', 'Monolith'] };
    let dataFlow = { description: '', apiProtocols: [], asyncProcessing: '' };
    let database = { databaseType: '', schema: '', dataAccessPattern: '' };
    let deployment = { infrastructure: '', containerization: '', cicdPipeline: '', deploymentSteps: [] };
    let quality = { security: '', scalability: '', performance: '', maintainability: '', resilience: '' };

    try {
      pattern = JSON.parse(patternAnalysis);
    } catch { }
    try {
      dataFlow = JSON.parse(dataFlowAnalysis);
    } catch { }
    try {
      database = JSON.parse(dbAnalysis);
    } catch { }
    try {
      deployment = JSON.parse(deploymentAnalysis);
    } catch { }
    try {
      quality = JSON.parse(qualityAnalysis);
    } catch { }

    this.updateStatus('processing', 95, 'Generating final architecture report...');

    const analysis: ArchitectureAnalysis = {
      highlevelOverview: {
        // Use REAL data from repository files, not hallucinations
        purpose: metadata.purpose,
        problemSolved: metadata.problems.length > 0
          ? `This project addresses: ${metadata.problems.join(', ')}`
          : `A ${context.repoInfo.language} project with structured architecture for scalability and maintainability`,
        stakeholders: metadata.targetUsers.length > 0
          ? metadata.targetUsers
          : ['Developers', 'End Users'],
        userWorkflow: this.generateUserWorkflow(metadata, techStack),
      },
      architecturalPattern: {
        pattern: pattern.pattern || 'Layered',
        rationale: pattern.rationale || `Architecture optimized for ${metadata.projectType}`,
        alternatives: pattern.alternatives || [],
      },
      repositoryStructure: {
        directory: dirs,
        organization: metadata.projectType === 'monorepo' ? 'Monorepo with multiple workspaces' : 'Modular monolithic structure',
        buildTools: this.detectBuildTools(context),
        monorepoExplanation: metadata.projectType === 'monorepo'
          ? 'Multiple projects in single repository with shared dependencies'
          : 'Single repository for the entire project',
      },
      components: metadata.components.length > 0
        ? metadata.components.map(comp => ({
            name: comp.name,
            description: comp.purpose,
            technology: this.getTechForComponent(comp.name, techStack),
            responsibility: this.getResponsibility(comp.name),
          }))
        : [
            {
              name: 'Frontend Application',
              description: 'User-facing interface',
              technology: techStack.frontend.join(', ') || 'Web Application',
              responsibility: 'UI/UX, state management, API communication',
            },
            {
              name: 'Backend API',
              description: 'Business logic and data processing',
              technology: techStack.backend.join(', ') || 'API Server',
              responsibility: 'Business logic, authentication, data validation',
            },
            {
              name: 'Database Layer',
              description: 'Data persistence',
              technology: techStack.database.join(', ') || 'Database',
              responsibility: 'Data storage, queries, transactions',
            },
          ],
      techStack,
      dataFlow: {
        description: dataFlow.description || this.generateDataFlowDescription(metadata, techStack),
        flowDiagram: this.generateDataFlowDiagram(metadata, techStack),
        apiProtocols: dataFlow.apiProtocols && dataFlow.apiProtocols.length > 0
          ? dataFlow.apiProtocols
          : (techStack.other.includes('REST API') || techStack.other.includes('GraphQL')
            ? ['HTTP/HTTPS', 'JSON']
            : (metadata.projectType === 'library' ? ['Function calls'] : [])),
        asyncProcessing: dataFlow.asyncProcessing || (techStack.messaging.length > 0
          ? 'Event-driven message processing with async handlers'
          : 'Synchronous request-response processing'),
      },
      dataArchitecture: {
        databaseType: database.databaseType || (techStack.database.length > 0
          ? 'Relational/NoSQL (detected in dependencies)'
          : 'Not applicable for this project type'),
        schema: database.schema || (techStack.database.length > 0
          ? 'Database schema based on application requirements'
          : 'N/A - No database dependencies detected'),
        dataAccessPattern: database.dataAccessPattern || (techStack.database.length > 0
          ? 'Repository/DAO pattern for abstraction'
          : 'No data persistence layer'),
        explanation: techStack.database.length > 0
          ? 'Data layer provides abstraction between business logic and persistence'
          : `This ${metadata.projectType} project does not use persistent data storage`,
      },
      deployment: {
        infrastructure: deployment.infrastructure || (metadata.hasDocker
          ? 'Containerized deployment'
          : 'Local development / Manual deployment'),
        containerization: deployment.containerization || (metadata.hasDocker
          ? 'Docker containers'
          : 'None - Run locally or via package manager'),
        cicdPipeline: deployment.cicdPipeline || (metadata.hasCICD
          ? 'Automated CI/CD pipeline detected'
          : 'Manual deployment process'),
        deploymentSteps: deployment.deploymentSteps && deployment.deploymentSteps.length > 0
          ? deployment.deploymentSteps
          : (metadata.hasDocker
            ? ['Build Docker image', 'Push to registry', 'Deploy container']
            : ['Clone repository', 'Install dependencies', 'Run application']),
      },
      qualityAttributes: {
        security: quality.security || this.generateQualityAttribute('security', metadata),
        scalability: quality.scalability || this.generateQualityAttribute('scalability', metadata),
        performance: quality.performance || this.generateQualityAttribute('performance', metadata),
        maintainability: quality.maintainability || this.generateQualityAttribute('maintainability', metadata),
        resilience: quality.resilience || this.generateQualityAttribute('resilience', metadata),
      },
      architectureDecisions: [
        {
          decision: `Chose ${pattern.pattern} architecture`,
          rationale: pattern.rationale,
          alternatives: pattern.alternatives,
          tradeoffs: `${metadata.projectType} structure provides ${metadata.projectType === 'monorepo' ? 'code sharing' : 'simplicity'} at the cost of ${metadata.projectType === 'monorepo' ? 'increased complexity' : 'less modularity'}`,
        },
        {
          decision: `Technology Stack: ${techStack.backend.length > 0 ? techStack.backend[0] : 'Backend'}`,
          rationale: 'Selected for ecosystem support and team expertise',
          alternatives: techStack.backend.slice(1).length > 0 ? techStack.backend.slice(1) : ['Alternative frameworks'],
          tradeoffs: 'Balances learning curve with long-term maintainability',
        },
        ...(metadata.hasDocker ? [{
          decision: 'Containerization with Docker',
          rationale: 'Ensures consistency across development and production environments',
          alternatives: ['Virtual machines', 'Bare metal'],
          tradeoffs: 'Added infrastructure complexity for deployment consistency',
        }] : []),
        ...(metadata.hasCICD ? [{
          decision: 'Automated CI/CD Pipeline',
          rationale: 'Enables fast, reliable deployments and testing',
          alternatives: ['Manual deployment', 'Staged releases'],
          tradeoffs: 'Initial setup complexity for long-term velocity gains',
        }] : []),
      ],
      diagramMermaid: flowDiagram,
    };

    this.updateStatus('processing', 100, 'Complete');
    return analysis;
  }
}
