/**
 * GitHub Context Builder
 *
 * Fetches repository files directly from GitHub API and builds
 * a context string for LLM chat — mirrors the approach in f/server.py.
 */

import { Octokit } from '@octokit/rest';
import { Logger } from '@/lib/utils/errors';

const MAX_CONTEXT_CHARS = 12000;
const MAX_FILE_CHARS = 1000;
const MAX_FILES = 10;

const CODE_EXTENSIONS = new Set([
  '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.cs',
  '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.html', '.css',
  '.sh', '.yaml', '.yml', '.toml', '.json',
]);

const PRIORITY_FILES = [
  'requirements.txt', 'package.json', 'pyproject.toml',
  'Dockerfile', 'docker-compose.yml',
  'main.py', 'app.py', 'index.js', 'index.ts',
];

function isCodeFile(path: string): boolean {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

// ── Cache: repoId → context string ──
const contextCache = new Map<string, { context: string; meta: RepoMeta; cachedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface RepoMeta {
  name: string;
  description: string | null;
  language: string | null;
  stars: number;
}

/**
 * Build a context string from a GitHub repository.
 * Fetches README + priority files + code files and concatenates them.
 */
export async function buildGitHubContext(
  repoId: string, // "owner/repo"
  accessToken?: string
): Promise<{ context: string; meta: RepoMeta }> {
  // Check cache
  const cached = contextCache.get(repoId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    Logger.info(`[GitHubContext] Cache hit for ${repoId}`);
    return { context: cached.context, meta: cached.meta };
  }

  Logger.info(`[GitHubContext] Fetching context for ${repoId}`);
  const [owner, repo] = repoId.split('/');
  const octokit = new Octokit({ auth: accessToken || undefined });

  // Fetch repo metadata
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const meta: RepoMeta = {
    name: repoData.full_name,
    description: repoData.description,
    language: repoData.language,
    stars: repoData.stargazers_count,
  };

  const metaText = `Repo: ${meta.name}\nDesc: ${meta.description || 'N/A'}\nLang: ${meta.language || 'N/A'}\nStars: ${meta.stars}`;

  // Fetch README
  let readme = 'No README';
  try {
    const { data: readmeData } = await octokit.repos.getReadme({ owner, repo });
    if ('content' in readmeData) {
      readme = Buffer.from(readmeData.content, 'base64').toString('utf-8').slice(0, 1000);
    }
  } catch {
    // No readme available
  }

  // Fetch file tree
  let paths: string[] = [];
  try {
    const { data: tree } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: repoData.default_branch,
      recursive: 'true',
    });
    paths = tree.tree
      .filter((item) => item.type === 'blob' && item.path)
      .map((item) => item.path!)
      .slice(0, 300);
  } catch (err) {
    Logger.warn('[GitHubContext] Failed to fetch tree', err);
  }

  // Select files: priority first, then code files
  const selected: string[] = [];
  for (const f of PRIORITY_FILES) {
    if (paths.includes(f) && selected.length < MAX_FILES) {
      selected.push(f);
    }
  }
  for (const p of paths) {
    if (selected.length >= MAX_FILES) break;
    if (!selected.includes(p) && isCodeFile(p)) {
      selected.push(p);
    }
  }

  // Fetch file contents
  let codeText = '';
  for (const filePath of selected) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: filePath });
      if ('content' in data && typeof data.content === 'string') {
        const content = Buffer.from(data.content, 'base64').toString('utf-8').slice(0, MAX_FILE_CHARS);
        codeText += `\n### ${filePath}\n${content}\n`;
      }
    } catch {
      // skip unreadable files
    }
  }

  const context = `${metaText}\n\nREADME:\n${readme}\n\nCODE:\n${codeText}`.slice(0, MAX_CONTEXT_CHARS);

  // Cache it
  contextCache.set(repoId, { context, meta, cachedAt: Date.now() });
  Logger.info(`[GitHubContext] Built ${context.length} chars of context for ${repoId}`);

  return { context, meta };
}
