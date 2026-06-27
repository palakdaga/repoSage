import { ProcessingProgress } from '@/lib/types';

export class ProgressTracker {
  private static instances = new Map<string, ProcessingProgress>();

  static createProgress(repositoryId: string, totalFiles: number): ProcessingProgress {
    const progress: ProcessingProgress = {
      repositoryId,
      status: 'cloning',
      progress: 0,
      totalFiles,
      processedFiles: 0
    };
    
    this.instances.set(repositoryId, progress);
    return progress;
  }

  static updateProgress(
    repositoryId: string, 
    status?: ProcessingProgress['status'],
    currentFile?: string,
    processedFiles?: number
  ): ProcessingProgress | null {
    const progress = this.instances.get(repositoryId) ?? null;
    if (!progress) return null;

    if (status) progress.status = status;
    if (currentFile) progress.currentFile = currentFile;
    if (processedFiles !== undefined) {
      progress.processedFiles = processedFiles;
      progress.progress = Math.round((processedFiles / progress.totalFiles) * 100);
    }

    this.instances.set(repositoryId, progress);
    return progress;
  }

  static getProgress(repositoryId: string): ProcessingProgress | null {
    return this.instances.get(repositoryId) || null;
  }

  static completeProgress(repositoryId: string): ProcessingProgress | null {
    const progress = this.instances.get(repositoryId) ?? null;
    if (progress) {
      progress.status = 'completed';
      progress.progress = 100;
      this.instances.delete(repositoryId);
      return progress;
    }
    return null;
  }

  static failProgress(repositoryId: string, error: string): ProcessingProgress | null {
    const progress = this.instances.get(repositoryId) ?? null;
    if (progress) {
      progress.status = 'failed';
      progress.error = error;
      this.instances.delete(repositoryId);
      return progress;
    }
    return null;
  }
}