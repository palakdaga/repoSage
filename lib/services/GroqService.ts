import Groq from 'groq-sdk';
import { Logger } from '@/lib/utils/errors';

interface GroqChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class GroqService {
  private client: Groq | null = null;
  private model: string;

  constructor(
    apiKey?: string,
    model?: string
  ) {
    const key = apiKey || process.env.GROQ_API_KEY;
    this.model = model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

    if (key) {
      this.client = new Groq({ apiKey: key });
      Logger.info('[GroqService] Initialized with model: ' + this.model);
    } else {
      Logger.warn('[GroqService] No GROQ_API_KEY found — Groq chat disabled');
    }
  }

  /**
   * Check if Groq is available (API key configured).
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Non-streaming chat completion.
   */
  async chat(
    messages: GroqChatMessage[],
    systemPrompt?: string
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Groq client not initialized');
    }

    const allMessages: GroqChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: allMessages,
        temperature: 0.2,
        max_tokens: 800,
      });

      return response.choices[0]?.message?.content || '';
    } catch (err) {
      Logger.error('[GroqService] Chat failed', err);
      throw err;
    }
  }

  /**
   * Streaming chat completion — yields tokens as they arrive.
   */
  async *chatStream(
    messages: GroqChatMessage[],
    systemPrompt?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!this.client) {
      throw new Error('Groq client not initialized');
    }

    const allMessages: GroqChatMessage[] = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...messages]
      : messages;

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: allMessages,
        temperature: 0.2,
        max_tokens: 800,
        stream: true,
      });

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content;
        if (token) {
          yield token;
        }
      }
    } catch (err) {
      Logger.error('[GroqService] Stream failed', err);
      throw err;
    }
  }
}

// ── Singleton ────────────────────────────────────────────────
let _groqInstance: GroqService | null = null;

export function getSharedGroqService(): GroqService {
  if (!_groqInstance) {
    _groqInstance = new GroqService();
  }
  return _groqInstance;
}
