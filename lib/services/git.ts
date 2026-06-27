import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class GitService {
  private git: SimpleGit;
  private tempDir: string;

  constructor() {
    this.git = simpleGit();
    this.tempDir = path.join(os.tmpdir(), 'reposage');
  }

  async cloneRepository(url: string, depth: number = 1, accessToken?: string): Promise<string> {
    try {
      // Create unique directory for this repository
      const repoName = this.extractRepoName(url);
      const clonePath = path.join(this.tempDir, `${repoName}-${Date.now()}`);
      
      // Ensure temp directory exists
      await fs.mkdir(this.tempDir, { recursive: true });
      
      console.log(`Cloning repository ${url} to ${clonePath}`);
      
      // Prepare git options
      const gitOptions: any = {
        '--depth': depth.toString(),
        '--single-branch': null,
        '--no-tags': null
      };
      
      // Add authentication if token is provided
      let cloneUrl = url;
      if (accessToken) {
        // Convert HTTPS URL to authenticated format
        if (url.startsWith('https://github.com/')) {
          cloneUrl = url.replace('https://github.com/', `https://x-access-token:${accessToken}@github.com/`);
        }
      }
      
      // Perform shallow clone for efficiency
      await this.git.clone(cloneUrl, clonePath, gitOptions);

      console.log(`Successfully cloned repository to ${clonePath}`);
      return clonePath;
      
    } catch (error: any) {
      console.error('Failed to clone repository:', error);
      if (error.message?.includes('Authentication') || error.message?.includes('403')) {
        throw new Error('Access denied. This repository may be private. Please sign in with GitHub to access private repositories.');
      }
      throw new Error(`Repository cloning failed: ${error.message}`);
    }
  }

  async getRepositoryFiles(repoPath: string): Promise<string[]> {
    try {
      const files: string[] = [];
      
      const walk = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(repoPath, fullPath);
          
          // Skip hidden directories and common build artifacts
          if (entry.name.startsWith('.') || this.shouldIgnorePath(relativePath)) {
            continue;
          }
          
          if (entry.isDirectory()) {
            await walk(fullPath);
          } else {
            files.push(relativePath);
          }
        }
      };
      
      await walk(repoPath);
      return files;
      
    } catch (error) {
      console.error('Failed to read repository files:', error);
      throw new Error(`Could not read repository files: ${error}`);
    }
  }

  async readFileContent(repoPath: string, filePath: string): Promise<string> {
    try {
      const fullPath = path.join(repoPath, filePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error) {
      console.error(`Failed to read file ${filePath}:`, error);
      throw new Error(`Could not read file ${filePath}: ${error}`);
    }
  }

  async cleanupRepository(repoPath: string): Promise<void> {
    try {
      await fs.rm(repoPath, { recursive: true, force: true });
      console.log(`Cleaned up repository at ${repoPath}`);
    } catch (error) {
      console.error(`Failed to cleanup repository ${repoPath}:`, error);
    }
  }

  private extractRepoName(url: string): string {
    const match = url.match(/github\.com\/[^\/]+\/([^\/\.]+)/);
    return match ? match[1] : 'repository';
  }

  private shouldIgnorePath(filePath: string): boolean {
    const ignorePatterns = [
      'node_modules',
      'build',
      'dist',
      '.git',
      '.vscode',
      '.idea',
      '__pycache__',
      '.next',
      'coverage',
      '*.log',
      '*.lock',
      '*.min.js',
      '*.min.css'
    ];

    return ignorePatterns.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        return regex.test(filePath);
      }
      return filePath.includes(pattern);
    });
  }
}