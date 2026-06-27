import { Logger } from '@/lib/utils/errors';

export type AgentStatusType = 'idle' | 'initializing' | 'processing' | 'completed' | 'error' | 'retrying';

export interface AgentStatusInfo {
  agentId: string;
  agentName: string;
  status: AgentStatusType;
  progress: number;
  currentTask: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

export interface AgentConfig {
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: AgentConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 120000,
};

export abstract class BaseAgent {
  public readonly agentId: string;
  public readonly agentName: string;
  protected config: AgentConfig;
  protected statusInfo: AgentStatusInfo;
  private onStatusChange?: (status: AgentStatusInfo) => void;

  constructor(agentId: string, agentName: string, config?: Partial<AgentConfig>) {
    this.agentId = agentId;
    this.agentName = agentName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.statusInfo = {
      agentId,
      agentName,
      status: 'idle',
      progress: 0,
      currentTask: '',
      retryCount: 0,
    };
  }

  setStatusListener(listener: (status: AgentStatusInfo) => void): void {
    this.onStatusChange = listener;
  }

  getStatus(): AgentStatusInfo {
    return { ...this.statusInfo };
  }

  protected updateStatus(
    status: AgentStatusType,
    progress: number,
    currentTask: string,
    error?: string
  ): void {
    this.statusInfo = {
      ...this.statusInfo,
      status,
      progress: Math.min(100, Math.max(0, progress)),
      currentTask,
      error,
    };
    if (status === 'processing' && !this.statusInfo.startedAt) {
      this.statusInfo.startedAt = new Date();
    }
    if (status === 'completed' || status === 'error') {
      this.statusInfo.completedAt = new Date();
    }
    this.onStatusChange?.(this.statusInfo);
  }

  async run(input: unknown): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          this.statusInfo.retryCount = attempt;
          this.updateStatus('retrying', this.statusInfo.progress, `Retry attempt ${attempt}/${this.config.maxRetries}`);
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }

        this.updateStatus('initializing', 0, 'Initializing...');
        Logger.info(`[${this.agentName}] Starting execution (attempt ${attempt + 1})`);

        await this.initialize(input);
        this.updateStatus('processing', 5, 'Processing...');

        const result = await this.withTimeout(this.execute(input), this.config.timeoutMs);

        this.updateStatus('completed', 100, 'Completed');
        Logger.info(`[${this.agentName}] Completed successfully`);

        await this.cleanup();
        return result;

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        Logger.error(`[${this.agentName}] Error (attempt ${attempt + 1}): ${lastError.message}`);

        try {
          await this.cleanup();
        } catch {
          // cleanup errors are non-fatal
        }
      }
    }

    this.updateStatus('error', this.statusInfo.progress, 'Failed after all retries', lastError?.message);
    throw lastError;
  }

  protected abstract initialize(input: unknown): Promise<void>;
  protected abstract execute(input: unknown): Promise<unknown>;

  protected async cleanup(): Promise<void> {
    // Override in subclasses if needed
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent ${this.agentName} timed out after ${ms}ms`)), ms)
      ),
    ]);
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
