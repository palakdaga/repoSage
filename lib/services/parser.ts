import path from 'path';

export class LanguageDetector {
  private static readonly languageMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'c',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.sql': 'sql',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.json': 'json',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.txt': 'text'
  };

  static detectLanguage(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();
    return this.languageMap[extension] || 'unknown';
  }

  static isSupportedLanguage(language: string): boolean {
    return Object.values(this.languageMap).includes(language);
  }

  static getFileExtensions(language: string): string[] {
    return Object.entries(this.languageMap)
      .filter(([, lang]) => lang === language)
      .map(([ext]) => ext);
  }

  static getSupportedLanguages(): string[] {
    return Array.from(new Set(Object.values(this.languageMap)));
  }
}

export class CodeParser {
  static extractFunctions(content: string, language: string): string[] {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return this.extractJavaScriptFunctions(content);
      case 'python':
        return this.extractPythonFunctions(content);
      case 'java':
        return this.extractJavaMethods(content);
      case 'cpp':
      case 'c':
        return this.extractCppFunctions(content);
      default:
        return [];
    }
  }

  static extractClasses(content: string, language: string): string[] {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return this.extractJavaScriptClasses(content);
      case 'python':
        return this.extractPythonClasses(content);
      case 'java':
        return this.extractJavaClasses(content);
      case 'cpp':
      case 'c':
        return this.extractCppClass(content);
      default:
        return [];
    }
  }

  static extractImports(content: string, language: string): string[] {
    switch (language) {
      case 'javascript':
      case 'typescript':
        return this.extractJavaScriptImports(content);
      case 'python':
        return this.extractPythonImports(content);
      case 'java':
        return this.extractJavaImports(content);
      default:
        return [];
    }
  }

  private static extractJavaScriptFunctions(content: string): string[] {
    const functionRegex = /function\s+(\w+)\s*\([^)]*\)|(\w+)\s*=\s*function\s*\([^)]*\)|(\w+)\s*=>\s*/g;
    const matches = content.match(functionRegex) || [];
    return matches.map(match => match.trim());
  }

  private static extractJavaScriptClasses(content: string): string[] {
    const classRegex = /class\s+(\w+)/g;
    const matches = content.match(classRegex) || [];
    return matches.map(match => match.replace('class ', '').trim());
  }

  private static extractJavaScriptImports(content: string): string[] {
    const importRegex = /(import\s+.*?from\s+['"][^'"]+['"]|require\(['"][^'"]+['"]\))/g;
    const matches = content.match(importRegex) || [];
    return matches.map(match => match.trim());
  }

  private static extractPythonFunctions(content: string): string[] {
    const functionRegex = /def\s+(\w+)\s*\([^)]*\):/g;
    const matches = content.match(functionRegex) || [];
    return matches.map(match => match.replace('def ', '').replace(/\(.*/, '').trim());
  }

  private static extractPythonClasses(content: string): string[] {
    const classRegex = /class\s+(\w+)\s*[(:]/g;
    const matches = content.match(classRegex) || [];
    return matches.map(match => match.replace('class ', '').replace(/[(:].*/, '').trim());
  }

  private static extractPythonImports(content: string): string[] {
    const importRegex = /(import\s+\w+|from\s+\w+\s+import\s+.*)/g;
    const matches = content.match(importRegex) || [];
    return matches.map(match => match.trim());
  }

  private static extractJavaMethods(content: string): string[] {
    const methodRegex = /(public|private|protected)\s+\w+\s+(\w+)\s*\([^)]*\)\s*\{/g;
    const matches = content.match(methodRegex) || [];
    return matches.map(match => {
      const parts = match.split(/\s+/);
      return parts[parts.length - 2]; // Method name is second to last part
    });
  }

  private static extractJavaClasses(content: string): string[] {
    const classRegex = /(public|private|protected)?\s*class\s+(\w+)/g;
    const matches = content.match(classRegex) || [];
    return matches.map(match => {
      const parts = match.split(/\s+/);
      return parts[parts.length - 1]; // Class name is last part
    });
  }

  private static extractJavaImports(content: string): string[] {
    const importRegex = /import\s+[\w.]+\s*;/g;
    const matches = content.match(importRegex) || [];
    return matches.map(match => match.replace('import ', '').replace(';', '').trim());
  }

  private static extractCppFunctions(content: string): string[] {
    // Simplified C++ function extraction
    const functionRegex = /\w+\s+(\w+)\s*\([^)]*\)\s*(?:\{|;)/g;
    const matches = content.match(functionRegex) || [];
    return matches.map(match => {
      const parts = match.split(/\s+/);
      return parts[parts.length - 2]; // Function name is second to last part
    });
  }

  private static extractCppClass(content: string): string[] {
    const classRegex = /class\s+(\w+)/g;
    const matches = content.match(classRegex) || [];
    return matches.map(match => match.replace('class ', '').trim());
  }
}