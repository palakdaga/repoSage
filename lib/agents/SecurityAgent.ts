import { BaseAgent } from './BaseAgent';
import { RepositoryContext, SecurityFinding } from '@/lib/types';
import { Groq } from 'groq-sdk';

interface SecurityPattern {
  name: string;
  pattern: RegExp;
  severity: SecurityFinding['severity'];
  category: string;
  description: string;
  recommendation: string;
  languages: string[]; // Only check these file languages; empty = all
}

const SECURITY_PATTERNS: SecurityPattern[] = [
  {
    name: 'Hardcoded API Key',
    pattern: /(?:api[_-]?key|apikey|api_secret|AUTH_KEY|STRIPE_KEY)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi,
    severity: 'critical',
    category: 'Secrets',
    description: 'Hardcoded API key detected. If this reaches a public repo, attackers can steal your API access.',
    recommendation: 'Move API keys to environment variables or a secrets manager like AWS Secrets Manager',
    languages: [],
  },
  {
    name: 'Hardcoded Password',
    pattern: /(?:password|passwd|pwd|db_password|DATABASE_PASSWORD)\s*[:=]\s*['"][^'"]{4,}['"]/gi,
    severity: 'critical',
    category: 'Secrets',
    description: 'Hardcoded password found. Anyone with code access can read this credential.',
    recommendation: 'Use environment variables or a vault service for storing passwords',
    languages: [],
  },
  {
    name: 'Hardcoded Token',
    pattern: /(?:token|secret|jwt_secret|refresh_token|access_token)\s*[:=]\s*['"][A-Za-z0-9_\-\.]{20,}['"]/gi,
    severity: 'high',
    category: 'Secrets',
    description: 'Hardcoded authentication token detected. Tokens should never be committed to source control.',
    recommendation: 'Store tokens securely using environment variables or a secrets manager',
    languages: [],
  },
  {
    name: 'Hardcoded Database URL',
    pattern: /(?:mongodb|postgres|mysql|sql_url|DATABASE_URL)\s*[:=]\s*['"][^'"]*(?:user|pass|password):([^@\s'"]+)/gi,
    severity: 'critical',
    category: 'Secrets',
    description: 'Database connection string with credentials exposed. An attacker can use this to access your database.',
    recommendation: 'Move database credentials to environment variables',
    languages: [],
  },
  {
    name: 'eval() Usage',
    pattern: /\beval\s*\(/g,
    severity: 'high',
    category: 'Code Injection',
    description: 'eval() executes arbitrary code. If user input reaches it, attackers can run any code on your server.',
    recommendation: 'Remove eval(). Use JSON.parse() for JSON, or a sandboxed VM for dynamic execution',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'SQL Injection Risk',
    pattern: /(?:query|execute|raw)\s*\(\s*['"`].*?\$\{|(?:query|execute)\s*\(\s*.*?\+\s*(?:req|request)/gi,
    severity: 'high',
    category: 'SQL Injection',
    description: 'SQL query built with string concatenation. Attackers can inject SQL to read, modify, or delete your database.',
    recommendation: 'Use parameterized queries or an ORM. Never concatenate user input into SQL strings.',
    languages: ['javascript', 'typescript', 'python', 'java'],
  },
  {
    name: 'XSS Risk (innerHTML)',
    pattern: /\.innerHTML\s*=|dangerouslySetInnerHTML/g,
    severity: 'medium',
    category: 'XSS',
    description: 'Direct HTML injection. If user content is inserted, attackers can execute scripts in users\' browsers.',
    recommendation: 'Sanitize with DOMPurify before injection. Use textContent for non-HTML content.',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Missing Input Validation',
    pattern: /req\.(query|params|body)\.\w+\s*(?!.*(?:validate|sanitize|trim|type|length))/g,
    severity: 'medium',
    category: 'Input Validation',
    description: 'User input accessed without validation. Unsanitized input is the root cause of most web vulnerabilities.',
    recommendation: 'Validate all input with joi, zod, or express-validator before using',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Insecure Random',
    pattern: /Math\.random\(\)/g,
    severity: 'low',
    category: 'Cryptography',
    description: 'Math.random() is predictable. Do not use for tokens, session IDs, or any security-sensitive values.',
    recommendation: 'Use crypto.randomBytes() or crypto.randomUUID() for security-sensitive operations',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'CORS Wildcard',
    pattern: /cors\(\s*\)|['"]\*['"]\s*(?::|,|origin|Allow)/gi,
    severity: 'high',
    category: 'CORS',
    description: 'Wildcard CORS allows any website to make requests to your API, enabling CSRF-like attacks.',
    recommendation: 'Restrict CORS to your specific frontend domains only',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Disabled SSL Verification',
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/gi,
    severity: 'high',
    category: 'TLS',
    description: 'SSL verification disabled. Your app will accept any certificate, including from attackers (MITM).',
    recommendation: 'Enable SSL verification. Fix certificate issues instead of disabling verification.',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Missing Authentication Check',
    pattern: /app\.(get|post|put|delete|patch)\s*\(['"][^'"]*['"],\s*(?:async\s+)?\([^)]*\)\s*=>/g,
    severity: 'high',
    category: 'Authentication',
    description: 'Express route without authentication middleware. Anyone can call this endpoint without logging in.',
    recommendation: 'Add authentication middleware (passport, jwt-verify) before route handlers',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Command Injection Risk',
    pattern: /exec(?:File|Sync)?\s*\(\s*[`'"]+.*\$\{|spawn\s*\([`'"]+.*\$\{|child_process\.exec\s*\([`'"][^`'"]*\$\{/gi,
    severity: 'high',
    category: 'Command Injection',
    description: 'Shell command built with user input. Attackers can execute arbitrary OS commands on your server.',
    recommendation: 'Use execFile() with argument arrays instead of exec() with string interpolation',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Insecure Cookie',
    pattern: /cookie\s*\(|set-cookie|setCookie|res\.cookie\s*\([^)]*(?!.*(?:httpOnly|secure|sameSite))/gi,
    severity: 'medium',
    category: 'Session',
    description: 'Cookie set without httpOnly/secure/sameSite flags. Cookies can be stolen via XSS or CSRF.',
    recommendation: 'Set httpOnly: true, secure: true, sameSite: "strict" on all cookies',
    languages: ['javascript', 'typescript'],
  },
  {
    name: 'Hardcoded IP Address',
    pattern: /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)['":]|['"](?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)['"]/g,
    severity: 'medium',
    category: 'Configuration',
    description: 'Hardcoded IP addresses prevent deployment to different environments.',
    recommendation: 'Use environment variables for all server addresses and ports',
    languages: [],
  },
  {
    name: 'Missing HTTPS Redirect',
    pattern: /\.listen\s*\(\s*80[^0-9]/gi,
    severity: 'medium',
    category: 'Protocol',
    description: 'Server listening on port 80 (HTTP). Data transmitted without encryption can be intercepted.',
    recommendation: 'Redirect all HTTP traffic to HTTPS. Use TLS certificates from Let\'s Encrypt.',
    languages: ['javascript', 'typescript'],
  },
];

export class SecurityAgent extends BaseAgent {
  private groq: Groq;

  constructor() {
    super('security', 'Security Agent', { timeoutMs: 60000 });
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  protected async initialize(): Promise<void> {}

  private async getGroqFix(finding: SecurityFinding, context?: string): Promise<string> {
    try {
      const prompt = `You are a security expert. A security vulnerability was found:

Title: ${finding.title}
Severity: ${finding.severity}
Description: ${finding.description}
Category: ${finding.category}
File: ${finding.filePath}
${context ? `\nCode context:\n${context}` : ''}

Provide a concise, practical fix (2-3 sentences max). Focus on:
1. Direct code changes needed
2. Libraries/tools to use
3. Configuration changes

Start with "Fix: "`;

      const message = await this.groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      });

      return message.choices[0]?.message?.content || finding.recommendation;
    } catch (error) {
      console.error('Groq API error:', error);
      return finding.recommendation;
    }
  }

  private async getDetailedExplanation(finding: SecurityFinding): Promise<{
    explanation: string;
    impact: string;
    steps: string[];
    codeExample: string;
  }> {
    try {
      const prompt = `You are a security expert. Provide a detailed security vulnerability analysis in JSON format:

Vulnerability: ${finding.title}
Description: ${finding.description}

Return ONLY valid JSON (no markdown code blocks) with this structure:
{
  "explanation": "1-2 sentences explaining WHY this is a security problem in technical detail",
  "impact": "1-2 sentences on business/security impact if not fixed",
  "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "codeExample": "Before/After code snippet showing the fix (max 10 lines)"
}`;

      const message = await this.groq.chat.completions.create({
        model: 'mixtral-8x7b-32768',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.choices[0]?.message?.content || '{}';
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedText);
      return {
        explanation: parsed.explanation || '',
        impact: parsed.impact || '',
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        codeExample: parsed.codeExample || '',
      };
    } catch (error) {
      console.error('Detailed explanation generation error:', error);
      return {
        explanation: finding.description,
        impact: 'Security risk depending on vulnerability type and exposure',
        steps: [
          finding.recommendation,
        ],
        codeExample: '// Implementation depends on specific vulnerability context',
      };
    }
  }

  protected async execute(input: unknown): Promise<SecurityFinding[]> {
    const context = input as RepositoryContext;
    const findings: SecurityFinding[] = [];
    const findingsByType: Record<string, SecurityFinding> = {};

    const filesToScan = context.files.filter(
      (f) => !f.path.includes('node_modules') && !f.path.includes('.min.') && f.language !== 'unknown'
    );

    let scanned = 0;
    for (const file of filesToScan) {
      this.updateStatus(
        'processing',
        10 + Math.round((scanned / filesToScan.length) * 80),
        `Scanning: ${file.name}`
      );

      const isTestFile = file.path.includes('test') || file.path.includes('spec') || file.path.includes('.test.');

      if (!isTestFile) {
        for (const pattern of SECURITY_PATTERNS) {
          // Skip patterns that don't apply to this file's language
          if (pattern.languages.length > 0 && !pattern.languages.includes(file.language)) continue;

          const matches = file.content.matchAll(pattern.pattern);
          for (const match of matches) {
            const lines = file.content.substring(0, match.index || 0).split('\n');
            const lineNumber = lines.length;
            const typeKey = `${pattern.name}:${file.path}`;

            // Only add one instance per finding type per file to avoid duplicates
            if (!findingsByType[typeKey]) {
              // Extract the matched code line + 1 line before/after for context
              const allLines = file.content.split('\n');
              const startCtx = Math.max(0, lineNumber - 2);
              const endCtx = Math.min(allLines.length - 1, lineNumber);
              const codeSnippet = allLines.slice(startCtx, endCtx + 1)
                .map((l, i) => `${startCtx + i + 1} | ${l}`)
                .join('\n');

              const finding: SecurityFinding = {
                id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
                severity: pattern.severity,
                title: pattern.name,
                description: pattern.description,
                filePath: file.path,
                lineNumber,
                category: pattern.category,
                recommendation: pattern.recommendation,
                codeExample: codeSnippet,
              };
              findingsByType[typeKey] = finding;
              findings.push(finding);
            }
          }
        }
      }

      // Check for missing security headers (once per file)
      if ((file.path.toLowerCase().includes('server') || file.path.toLowerCase().includes('app') || file.path.toLowerCase().includes('index')) && !isTestFile) {
        const helmetKey = `Missing Security Headers:${file.path}`;
        if (file.content.includes('express') && !file.content.includes('helmet') && !findingsByType[helmetKey]) {
          const finding: SecurityFinding = {
            id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
            severity: 'medium',
            title: 'Missing Security Headers (Helmet)',
            description: 'Express app does not use helmet for security headers',
            filePath: file.path,
            category: 'Headers',
            recommendation: 'Install and use helmet middleware: npm install helmet',
          };
          findingsByType[helmetKey] = finding;
          findings.push(finding);
        }

        // Check for rate limiting (once per file)
        const rateLimitKey = `Missing Rate Limiting:${file.path}`;
        if ((file.content.includes('app.post') || file.content.includes('app.get')) && !file.content.includes('rateLimit') && !file.content.includes('rate-limit') && !findingsByType[rateLimitKey]) {
          const finding: SecurityFinding = {
            id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
            severity: 'medium',
            title: 'Missing Rate Limiting',
            description: 'API routes without rate limiting protection',
            filePath: file.path,
            category: 'API Security',
            recommendation: 'Implement rate limiting with express-rate-limit or similar package',
          };
          findingsByType[rateLimitKey] = finding;
          findings.push(finding);
        }
      }

      // Check for secrets in .env.example (once per file)
      if (file.path.endsWith('.env.example') || file.path.endsWith('.env.local')) {
        const envSecretsKey = `Example Env Secrets:${file.path}`;
        if ((file.content.includes('API_KEY=') || file.content.includes('SECRET=')) && !findingsByType[envSecretsKey]) {
          const finding: SecurityFinding = {
            id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
            severity: 'medium',
            title: 'Example Env File Contains Secrets',
            description: '.env example file exposes actual secret names and patterns',
            filePath: file.path,
            category: 'Secrets',
            recommendation: 'Use .env.example for structure only, never include real credentials',
          };
          findingsByType[envSecretsKey] = finding;
          findings.push(finding);
        }
      }

      // Check for unsafe dependencies
      if (file.path.endsWith('package.json')) {
        const dangerous = ['eval', 'vm2', 'node-serialize'];
        for (const dep of dangerous) {
          const depKey = `Unsafe Dependency ${dep}:${file.path}`;
          if (file.content.includes(`"${dep}"`) && !findingsByType[depKey]) {
            const finding: SecurityFinding = {
              id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
              severity: 'high',
              title: `Unsafe Dependency: ${dep}`,
              description: `Package "${dep}" has known security vulnerabilities`,
              filePath: file.path,
              category: 'Dependencies',
              recommendation: `Review or remove "${dep}" dependency`,
            };
            findingsByType[depKey] = finding;
            findings.push(finding);
          }
        }
      }

      scanned++;
    }

    // Check for missing gitignore entries (once)
    const gitignoreFile = context.files.find(f => f.path === '.gitignore');
    if (gitignoreFile) {
      const criticalPatterns = ['node_modules/', '.env', '*.key', '*.pem', 'secrets/'];
      for (const pattern of criticalPatterns) {
        const gitignoreKey = `Missing gitignore ${pattern}`;
        if (!gitignoreFile.content.includes(pattern) && !findingsByType[gitignoreKey]) {
          const finding: SecurityFinding = {
            id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
            severity: 'medium',
            title: `Missing .gitignore Entry: ${pattern}`,
            description: `${pattern} should be in .gitignore to prevent accidental commits`,
            filePath: '.gitignore',
            category: 'Configuration',
            recommendation: `Add ${pattern} to .gitignore`,
          };
          findingsByType[gitignoreKey] = finding;
          findings.push(finding);
        }
      }
    } else {
      const noGitignoreKey = 'Missing .gitignore';
      if (!findingsByType[noGitignoreKey]) {
        const finding: SecurityFinding = {
          id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
          severity: 'high',
          title: 'Missing .gitignore',
          description: 'Repository does not have a .gitignore file',
          filePath: 'root',
          category: 'Configuration',
          recommendation: 'Create a .gitignore file to prevent accidental commits of sensitive files',
        };
        findingsByType[noGitignoreKey] = finding;
        findings.push(finding);
      }
    }

    // Check for missing secrets management (once)
    const hasSecretsConfig = context.files.some(f =>
      f.path.includes('.env') ||
      f.path.includes('secrets') ||
      f.content.includes('process.env')
    );

    if (!hasSecretsConfig) {
      const noSecretsKey = 'No Secrets Management';
      if (!findingsByType[noSecretsKey]) {
        const finding: SecurityFinding = {
          id: `sec_${Object.keys(findingsByType).length}_${Date.now()}`,
          severity: 'medium',
          title: 'No Secrets Management Configuration',
          description: 'Project does not appear to use environment variables for configuration',
          filePath: 'root',
          category: 'Secrets',
          recommendation: 'Implement environment variable management with dotenv or similar',
        };
        findingsByType[noSecretsKey] = finding;
        findings.push(finding);
      }
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    // Generate Groq fixes and detailed explanations for ALL findings
    for (let i = 0; i < findings.length; i++) {
      this.updateStatus('processing', 85 + Math.round((i / findings.length) * 14), `AI analysis ${i + 1}/${findings.length}...`);
      const finding = findings[i];
      const relatedFile = context.files.find(f => f.path === finding.filePath);
      const fileContext = relatedFile ? relatedFile.content.substring(0, 500) : '';

      // Get Groq fix for every finding
      finding.groqFix = await this.getGroqFix(finding, fileContext);

      // Get detailed explanation for critical and high severity
      if (finding.severity === 'critical' || finding.severity === 'high') {
        const details = await this.getDetailedExplanation(finding);
        finding.detailedExplanation = details.explanation;
        finding.impact = details.impact;
        finding.stepBySolution = details.steps;
        // Keep code snippet from actual match rather than LLM-generated
      }
    }

    return findings;
  }
}
