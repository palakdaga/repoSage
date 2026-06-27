import { OllamaService } from './OllamaService';
import { VectorDBService } from './VectorDBService';
import { CodeChunk } from '@/lib/types';
import { Logger } from '@/lib/utils/errors';

export class RAGPipeline {
  private ollama: OllamaService;
  private vectorDB: VectorDBService;

  constructor(ollama?: OllamaService, vectorDB?: VectorDBService) {
    this.ollama = ollama || new OllamaService();
    this.vectorDB = vectorDB || new VectorDBService(this.ollama);
  }

  async indexRepository(repositoryId: string, chunks: CodeChunk[]): Promise<number> {
    Logger.info(`[RAG] Indexing ${chunks.length} chunks for ${repositoryId}`);
    return this.vectorDB.storeChunks(repositoryId, chunks);
  }

  async query(
    repositoryId: string,
    userQuery: string,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<string> {
    const { messages, systemPrompt } = await this.buildChatPayload(repositoryId, userQuery, chatHistory);
    const response = await this.ollama.chat(messages, systemPrompt);
    return response;
  }

  /**
   * Streaming version of query — yields tokens as they arrive from the LLM.
   */
  async *queryStream(
    repositoryId: string,
    userQuery: string,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): AsyncGenerator<string, void, unknown> {
    const { messages, systemPrompt } = await this.buildChatPayload(repositoryId, userQuery, chatHistory);
    yield* this.ollama.chatStream(messages, systemPrompt);
  }

  isRepositoryIndexed(repositoryId: string): boolean {
    return this.vectorDB.hasRepository(repositoryId);
  }

  getVectorDB(): VectorDBService {
    return this.vectorDB;
  }

  getOllama(): OllamaService {
    return this.ollama;
  }

  /**
   * Build the chat messages payload (shared by query and queryStream).
   */
  private async buildChatPayload(
    repositoryId: string,
    userQuery: string,
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  ) {
    // 1. Enhance query for better code-aware retrieval
    const enhancedQuery = this.enhanceQueryForCode(userQuery);

    // 2. Retrieve relevant context (12 chunks for richer context)
    const relevantChunks = await this.vectorDB.similaritySearch(repositoryId, enhancedQuery, 12);

    // 3. Build augmented prompt with scored context
    const contextText = relevantChunks.length > 0
      ? relevantChunks
          .map((c, i) => {
            const file = c.metadata.fileId || c.metadata.filePath || 'unknown';
            const lines = c.metadata.startLine && c.metadata.endLine
              ? ` (L${c.metadata.startLine}-L${c.metadata.endLine})`
              : '';
            const score = (c.score * 100).toFixed(0);
            return `--- Context ${i + 1} [${file}${lines}] (relevance: ${score}%) ---\n${c.content}`;
          })
          .join('\n\n')
      : 'No specific code context available.';

    const systemPrompt = `You are RepoSage AI, an expert code analyst. You help users understand repositories by answering questions based on the actual code.

RULES:
- Answer based ONLY on the provided code context
- If the context doesn't contain relevant information, say so
- Use code references and file paths when explaining
- Include line numbers when available
- Be concise but thorough
- Format responses with markdown
- When referencing code, use fenced code blocks with the appropriate language`;

    // 4. Build conversation messages
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    // Add recent chat history (last 6 messages for context without bloat)
    const recentHistory = chatHistory.slice(-6);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add the current query with context
    messages.push({
      role: 'user',
      content: `Based on the following code from the repository:\n\n${contextText}\n\nUser question: ${userQuery}`,
    });

    return { messages, systemPrompt };
  }

  /**
   * Enhance user queries to be more effective for code search embeddings.
   */
  private enhanceQueryForCode(query: string): string {
    const lower = query.toLowerCase();
    const enhancements: string[] = [query];

    if (lower.includes('how') && (lower.includes('work') || lower.includes('implement'))) {
      enhancements.push('implementation function code logic');
    }
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('route')) {
      enhancements.push('route handler endpoint request response');
    }
    if (lower.includes('error') || lower.includes('bug') || lower.includes('fix')) {
      enhancements.push('error handling try catch exception');
    }
    if (lower.includes('test') || lower.includes('spec')) {
      enhancements.push('test describe it expect assert');
    }
    if (lower.includes('config') || lower.includes('setup') || lower.includes('install')) {
      enhancements.push('configuration settings environment setup');
    }
    if (lower.includes('import') || lower.includes('depend') || lower.includes('require')) {
      enhancements.push('import require dependency module');
    }
    if (lower.includes('database') || lower.includes('schema') || lower.includes('model')) {
      enhancements.push('database schema model table query');
    }

    return enhancements.join(' ');
  }
}
