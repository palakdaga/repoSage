import { BaseAgent } from './BaseAgent';
import { GitService } from '@/lib/services/git';
import { GitHubService } from '@/lib/services/github';
import { LanguageDetector } from '@/lib/services/parser';
import { FileChunker } from '@/lib/utils/chunking';
import { RepositoryContext, FileInfo, CodeChunk } from '@/lib/types';
import { Logger } from '@/lib/utils/errors';

interface IngestionInput {
  repositoryUrl: string;
  accessToken?: string;
}

// Concurrency control: process N files at a time
const FILE_READ_CONCURRENCY = 10;
const CHUNK_BATCH_SIZE = 20;

async function processInBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));

    for (const result of batchResults) {
      if (result.status === 'fulfilled' && result.value !== null) {
        results.push(result.value);
      }
    }
  }

  return results;
}

export class IngestionAgent extends BaseAgent {
  private gitService!: GitService;
  private githubService!: GitHubService;

  constructor() {
    super('ingestion', 'Ingestion Agent', { timeoutMs: 180000 });
  }

  protected async initialize(): Promise<void> {
    this.gitService = new GitService();
    this.githubService = new GitHubService(process.env.GITHUB_TOKEN);
  }

  protected async execute(input: unknown): Promise<RepositoryContext> {
    const { repositoryUrl, accessToken } = input as IngestionInput;

    // Step 1: Get repo info
    this.updateStatus('processing', 10, 'Fetching repository info...');
    const repoInfo = await this.githubService.getRepositoryInfo(repositoryUrl, accessToken);

    // Step 2: Clone repository
    this.updateStatus('processing', 20, 'Cloning repository...');
    const repoPath = await this.gitService.cloneRepository(repositoryUrl, 1, accessToken);

    // Step 3: Read all files in parallel batches
    this.updateStatus('processing', 35, 'Reading files...');
    const filePaths = await this.gitService.getRepositoryFiles(repoPath);
    Logger.info(`[IngestionAgent] Found ${filePaths.length} files to process`);

    let processedCount = 0;
    const totalFiles = filePaths.length;

    const files = await processInBatches<string, FileInfo>(
      filePaths,
      FILE_READ_CONCURRENCY,
      async (filePath: string): Promise<FileInfo | null> => {
        try {
          const content = await this.gitService.readFileContent(repoPath, filePath);
          const language = LanguageDetector.detectLanguage(filePath);
          const name = filePath.split('/').pop() || filePath.split('\\').pop() || '';
          const extension = filePath.split('.').pop() || '';

          if (FileChunker.shouldProcessFile(filePath, content.length)) {
            processedCount++;
            return { path: filePath, name, extension, size: content.length, content, language };
          }
          return null;
        } catch {
          Logger.warn(`[IngestionAgent] Skipping file: ${filePath}`);
          return null;
        } finally {
          processedCount++;
          if (processedCount % 20 === 0) {
            const pct = 35 + Math.round((processedCount / totalFiles) * 30);
            this.updateStatus('processing', pct, `Reading files... (${processedCount}/${totalFiles})`);
          }
        }
      },
    );

    Logger.info(`[IngestionAgent] Read ${files.length} processable files out of ${totalFiles}`);

    // Step 4: Chunk files in parallel batches
    this.updateStatus('processing', 70, 'Chunking files for analysis...');

    const chunkArrays = await processInBatches<FileInfo, CodeChunk[]>(
      files,
      CHUNK_BATCH_SIZE,
      async (file: FileInfo): Promise<CodeChunk[] | null> => {
        try {
          return FileChunker.chunkFile(file);
        } catch {
          Logger.warn(`[IngestionAgent] Failed to chunk: ${file.path}`);
          return null;
        }
      },
    );

    const chunks: CodeChunk[] = chunkArrays.flat();

    this.updateStatus('processing', 90, 'Preparing context...');
    Logger.info(`[IngestionAgent] Ingested ${files.length} files, ${chunks.length} chunks`);

    return {
      repoInfo,
      repoPath,
      files,
      chunks,
      accessToken,
    };
  }

  protected async cleanup(): Promise<void> {
    // Note: repoPath cleanup is handled by the coordinator after all agents finish
  }
}
