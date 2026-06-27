import { EventEmitter } from 'events';
import { Logger } from '@/lib/utils/errors';

export interface AgentMessage {
  id: string;
  from: string;
  to: string | '*'; // '*' = broadcast
  type: 'task' | 'result' | 'error' | 'status' | 'data';
  payload: unknown;
  timestamp: Date;
}

export class AgentCommunicationBus {
  private emitter: EventEmitter;
  private messageHistory: AgentMessage[] = [];
  private static instance: AgentCommunicationBus | null = null;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(50);
  }

  static getInstance(): AgentCommunicationBus {
    if (!this.instance) {
      this.instance = new AgentCommunicationBus();
    }
    return this.instance;
  }

  static resetInstance(): void {
    if (this.instance) {
      this.instance.emitter.removeAllListeners();
      this.instance.messageHistory = [];
      this.instance = null;
    }
  }

  publish(message: Omit<AgentMessage, 'id' | 'timestamp'>): void {
    const fullMessage: AgentMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date(),
    };

    this.messageHistory.push(fullMessage);
    Logger.debug(`[Bus] ${fullMessage.from} → ${fullMessage.to}: ${fullMessage.type}`);

    // Emit to specific agent
    if (fullMessage.to !== '*') {
      this.emitter.emit(`agent:${fullMessage.to}`, fullMessage);
    }
    // Always emit broadcast channel
    this.emitter.emit('broadcast', fullMessage);
  }

  subscribe(agentId: string, handler: (message: AgentMessage) => void): void {
    this.emitter.on(`agent:${agentId}`, handler);
    this.emitter.on('broadcast', (msg: AgentMessage) => {
      if (msg.from !== agentId) {
        handler(msg);
      }
    });
  }

  unsubscribe(agentId: string): void {
    this.emitter.removeAllListeners(`agent:${agentId}`);
  }

  onAny(handler: (message: AgentMessage) => void): void {
    this.emitter.on('broadcast', handler);
  }

  getHistory(agentId?: string): AgentMessage[] {
    if (!agentId) return [...this.messageHistory];
    return this.messageHistory.filter(
      (m) => m.from === agentId || m.to === agentId || m.to === '*'
    );
  }

  clear(): void {
    this.messageHistory = [];
  }
}
