import { Octokit } from '@octokit/rest';
import { RepositoryInfo } from '@/lib/types';

export class GitHubService {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'RepoSage/1.0.0',
    });
  }

  async validateRepository(url: string, accessToken?: string): Promise<boolean> {
    try {
      const { owner, repo } = this.parseRepoUrl(url);
      const octokit = accessToken ? new Octokit({ auth: accessToken }) : this.octokit;
      await octokit.repos.get({ owner, repo });
      return true;
    } catch (error: any) {
      console.error('Repository validation failed:', error);
      // Check if it's a private repository error
      if (error.status === 404) {
        throw new Error('Repository not found or access denied. This might be a private repository - please sign in with GitHub.');
      }
      return false;
    }
  }

  async getRepositoryInfo(url: string, accessToken?: string): Promise<RepositoryInfo> {
    try {
      const { owner, repo } = this.parseRepoUrl(url);
      const octokit = accessToken ? new Octokit({ auth: accessToken }) : this.octokit;
      const response = await octokit.repos.get({ owner, repo });
      
      const repoData = response.data;
      
      return {
        id: `${owner}/${repo}`,
        url: repoData.html_url,
        owner: repoData.owner.login,
        name: repoData.name,
        description: repoData.description || undefined,
        language: repoData.language || undefined,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        createdAt: new Date(repoData.created_at),
        updatedAt: new Date(repoData.updated_at),
      };
    } catch (error: any) {
      console.error('Failed to fetch repository info:', error);
      if (error.status === 404) {
        throw new Error('Repository not found or access denied. This might be a private repository - please sign in with GitHub.');
      }
      throw new Error(`Could not fetch repository information: ${error.message}`);
    }
  }

  async getRepositoryContents(owner: string, repo: string, path: string = '', accessToken?: string) {
    try {
      const octokit = accessToken ? new Octokit({ auth: accessToken }) : this.octokit;
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
      });
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch repository contents:', error);
      if (error.status === 404) {
        throw new Error('Cannot access repository contents. This might be a private repository - please sign in with GitHub.');
      }
      throw new Error(`Could not fetch repository contents: ${error.message}`);
    }
  }

  private parseRepoUrl(url: string): { owner: string; repo: string } {
    // Handle various GitHub URL formats
    const patterns = [
      /github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?$/,
      /github\.com\/([^\/]+)\/([^\/]+)\/?$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, '')
        };
      }
    }

    throw new Error('Invalid GitHub repository URL');
  }

  // OAuth methods for enhanced authentication
  async getUserRepos(accessToken: string): Promise<any[]> {
    try {
      const octokit = new Octokit({ auth: accessToken });
      const response = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user repositories:', error);
      throw new Error('Could not fetch your repositories');
    }
  }

  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const octokit = new Octokit({ auth: accessToken });
      const response = await octokit.users.getAuthenticated();
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      throw new Error('Could not fetch user information');
    }
  }
}