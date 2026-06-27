import { Logger } from '@/lib/utils/errors';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface QueueTask<T = unknown> {
  id: string;
  name: string;
  priority: TaskPriority;
  status: TaskStatus;
  data: T;
  result?: unknown;
  error?: string;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  execute: (data: T) => Promise<unknown>;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export class TaskQueue {
  private queue: QueueTask[] = [];
  private running: Map<string, QueueTask> = new Map();
  private completed: QueueTask[] = [];
  private maxConcurrent: number;
  private processing = false;

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue<T>(
    name: string,
    data: T,
    execute: (data: T) => Promise<unknown>,
    priority: TaskPriority = 'normal',
    maxRetries = 2
  ): string {
    const task: QueueTask<T> = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name,
      priority,
      status: 'pending',
      data,
      retryCount: 0,
      maxRetries,
      createdAt: new Date(),
      execute: execute as (data: unknown) => Promise<unknown>,
    };
    this.queue.push(task as QueueTask);
    this.queue.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    Logger.debug(`[TaskQueue] Enqueued: ${name} (priority: ${priority})`);
    return task.id;
  }

  async processAll(): Promise<QueueTask[]> {
    if (this.processing) return [];
    this.processing = true;

    try {
      while (this.queue.length > 0 || this.running.size > 0) {
        // Fill up to max concurrent
        while (this.queue.length > 0 && this.running.size < this.maxConcurrent) {
          const task = this.queue.shift()!;
          this.runTask(task);
        }
        // Wait for at least one to finish
        if (this.running.size > 0) {
          await Promise.race(
            Array.from(this.running.values()).map(
              (t) =>
                new Promise<void>((resolve) => {
                  const check = () => {
                    if (t.status === 'completed' || t.status === 'failed') {
                      resolve();
                    } else {
                      setTimeout(check, 50);
                    }
                  };
                  check();
                })
            )
          );
        }
      }
    } finally {
      this.processing = false;
    }

    return [...this.completed];
  }

  private async runTask(task: QueueTask): Promise<void> {
    task.status = 'running';
    task.startedAt = new Date();
    this.running.set(task.id, task);

    try {
      Logger.info(`[TaskQueue] Running: ${task.name}`);
      task.result = await task.execute(task.data);
      task.status = 'completed';
      task.completedAt = new Date();
      Logger.info(`[TaskQueue] Completed: ${task.name}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = 'pending';
        Logger.warn(`[TaskQueue] Retrying: ${task.name} (attempt ${task.retryCount})`);
        this.queue.unshift(task);
      } else {
        task.status = 'failed';
        task.error = error;
        task.completedAt = new Date();
        Logger.error(`[TaskQueue] Failed: ${task.name}: ${error}`);
      }
    } finally {
      this.running.delete(task.id);
      if (task.status === 'completed' || task.status === 'failed') {
        this.completed.push(task);
      }
    }
  }

  getStatus(): {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    tasks: Array<{ id: string; name: string; status: TaskStatus; progress: number }>;
  } {
    const allTasks = [
      ...this.queue,
      ...Array.from(this.running.values()),
      ...this.completed,
    ];
    return {
      pending: this.queue.length,
      running: this.running.size,
      completed: this.completed.filter((t) => t.status === 'completed').length,
      failed: this.completed.filter((t) => t.status === 'failed').length,
      tasks: allTasks.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        progress: t.status === 'completed' ? 100 : t.status === 'running' ? 50 : 0,
      })),
    };
  }

  clear(): void {
    this.queue = [];
    this.completed = [];
  }
}
