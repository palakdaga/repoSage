import { Logger } from '@/lib/utils/errors';

interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class OllamaService {
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;

  private available: boolean | null = null;
  private lastCheck = 0;
  private readonly CACHE_TTL = 10000; // 10 sec

  constructor(
    baseUrl = 'http://localhost:11434',
    model = 'llama3.2',
    embeddingModel = 'nomic-embed-text'
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.embeddingModel = embeddingModel;
  }

  // ---------------------------
  // Availability Check (cached)
  // ---------------------------
  async isAvailable(): Promise<boolean> {
    const now = Date.now();

    if (this.available !== null && now - this.lastCheck < this.CACHE_TTL) {
      return this.available;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });

      this.available = res.ok;
      this.lastCheck = now;
      return this.available;
    } catch (err) {
      this.available = false;
      this.lastCheck = now;

      if (err instanceof DOMException && err.name === 'AbortError') {
        Logger.warn('[OllamaService] Availability check timed out');
      } else {
        Logger.warn('[OllamaService] Ollama not available');
      }

      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------
  // Core fetch with timeout + retry
  // ---------------------------
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number,
    retry = 1
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      return res;
    } catch (err) {
      if (
        retry > 0 &&
        err instanceof DOMException &&
        err.name === 'AbortError'
      ) {
        Logger.warn('[OllamaService] Retrying after timeout...');
        return this.fetchWithTimeout(url, options, timeoutMs, retry - 1);
      }

      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------
  // Generate Completion
  // ---------------------------
  async generateCompletion(
    prompt: string,
    systemPrompt?: string
  ): Promise<string> {
    if (!(await this.isAvailable())) {
      return this.fallbackResponse(prompt);
    }

    try {
      const body: Record<string, unknown> = {
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 2048,
        },
      };

      if (systemPrompt) {
        body.system = systemPrompt;
      }

      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/api/generate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        60000, // ⬅️ increased timeout
        1
      );

      if (!res.ok) {
        throw new Error(`Ollama returned ${res.status}`);
      }

      const data = (await res.json()) as OllamaResponse;
      return data.response || '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        Logger.warn('[OllamaService] Completion timed out');
      } else {
        Logger.error('[OllamaService] Generation failed', err);
      }

      return this.fallbackResponse(prompt);
    }
  }

  // ---------------------------
  // Embeddings
  // ---------------------------
  async generateEmbedding(text: string): Promise<number[]> {
    if (!(await this.isAvailable())) {
      return this.fallbackEmbedding(text);
    }

    try {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/api/embeddings`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.embeddingModel,
            prompt: text,
          }),
        },
        20000
      );

      if (!res.ok) {
        throw new Error(`Ollama embedding returned ${res.status}`);
      }

      const data = (await res.json()) as OllamaEmbeddingResponse;
      return data.embedding || this.fallbackEmbedding(text);
    } catch (err) {
      Logger.warn('[OllamaService] Embedding fallback', err);
      return this.fallbackEmbedding(text);
    }
  }

  // ---------------------------
  // Chat API
  // ---------------------------
  async chat(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>,
    systemPrompt?: string
  ): Promise<string> {
    if (!(await this.isAvailable())) {
      const lastUser = messages.filter((m) => m.role === 'user').pop();
      return this.fallbackResponse(lastUser?.content || '');
    }

    try {
      const allMessages = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
        : messages;

      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages: allMessages,
            stream: false,
            options: {
              temperature: 0.4,
              num_predict: 2048,
            },
          }),
        },
        90000 // ⬅️ longer timeout
      );

      if (!res.ok) {
        throw new Error(`Ollama chat returned ${res.status}`);
      }

      const data = await res.json();
      return data.message?.content || '';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        Logger.warn('[OllamaService] Chat timed out');
      } else {
        Logger.error('[OllamaService] Chat failed', err);
      }

      const lastUser = messages.filter((m) => m.role === 'user').pop();
      return this.fallbackResponse(lastUser?.content || '');
    }
  }

  // ---------------------------
  // Streaming Chat API
  // ---------------------------
  async *chatStream(
    messages: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
    }>,
    systemPrompt?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!(await this.isAvailable())) {
      const lastUser = messages.filter((m) => m.role === 'user').pop();
      yield this.fallbackResponse(lastUser?.content || '');
      return;
    }

    try {
      const allMessages = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
        : messages;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);

      try {
        const res = await fetch(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            messages: allMessages,
            stream: true,
            options: {
              temperature: 0.4,
              num_predict: 2048,
            },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Ollama chat returned ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('No response body reader');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                yield json.message.content;
              }
              if (json.done) {
                return;
              }
            } catch {
              // skip malformed JSON lines
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer);
            if (json.message?.content) {
              yield json.message.content;
            }
          } catch {
            // ignore
          }
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        Logger.warn('[OllamaService] Stream timed out');
      } else {
        Logger.error('[OllamaService] Stream failed', err);
      }
      const lastUser = messages.filter((m) => m.role === 'user').pop();
      yield this.fallbackResponse(lastUser?.content || '');
    }
  }

  // ---------------------------
  // Fallbacks
  // ---------------------------
  private fallbackResponse(prompt: string): string {
    const lower = prompt.toLowerCase();

    if (lower.includes('summary') || lower.includes('overview')) {
      return 'This is an AI-generated summary based on static analysis. For enhanced results, please ensure Ollama is running with a compatible model.';
    }

    if (lower.includes('security')) {
      return 'Security analysis completed using pattern-based detection. For deeper analysis, enable Ollama LLM integration.';
    }

    if (lower.includes('architecture')) {
      return 'Architecture analysis derived from directory structure and import patterns. AI-enhanced analysis requires Ollama.';
    }

    return 'Analysis completed using heuristic methods. For AI-powered insights, ensure Ollama is running at localhost:11434.';
  }

  private fallbackEmbedding(text: string): number[] {
    const dims = 384;
    const embedding = new Array(dims).fill(0);

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      embedding[i % dims] += charCode / 1000;
      embedding[(i * 7) % dims] += charCode * 0.003;
    }

    const magnitude = Math.sqrt(
      embedding.reduce((sum, v) => sum + v * v, 0)
    );

    if (magnitude > 0) {
      for (let i = 0; i < dims; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }
}