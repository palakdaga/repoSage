import { FileInfo, CodeChunk } from '@/lib/types';
import { LanguageDetector, CodeParser } from '@/lib/services/parser';

export class FileChunker {
  private static readonly DEFAULT_CHUNK_SIZE = 1500; // characters (increased for better context)
  private static readonly OVERLAP_SIZE = 200; // characters

  static chunkFile(fileInfo: FileInfo, maxSize: number = this.DEFAULT_CHUNK_SIZE): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const content = fileInfo.content;

    if (content.length <= maxSize) {
      // File fits in a single chunk — add contextual header
      const enrichedContent = this.buildContextHeader(fileInfo) + content;
      chunks.push(this.createChunk(fileInfo, enrichedContent, 0, content.length));
      return chunks;
    }

    // For larger files, split intelligently
    if (LanguageDetector.isSupportedLanguage(fileInfo.language)) {
      return this.chunkCodeFile(fileInfo, maxSize);
    } else {
      return this.chunkTextFile(fileInfo, maxSize);
    }
  }

  private static chunkCodeFile(fileInfo: FileInfo, maxSize: number): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const content = fileInfo.content;
    const lines = content.split('\n');
    const header = this.buildContextHeader(fileInfo);

    // Extract structural info for richer metadata
    const functions = CodeParser.extractFunctions(content, fileInfo.language);
    const classes = CodeParser.extractClasses(content, fileInfo.language);
    const imports = CodeParser.extractImports(content, fileInfo.language);

    // Try to split at structural boundaries (function/class definitions)
    const boundaries = this.findStructuralBoundaries(lines, fileInfo.language);

    if (boundaries.length > 1) {
      // Use structural boundaries for splitting
      for (let i = 0; i < boundaries.length; i++) {
        const startLine = boundaries[i];
        const endLine = i + 1 < boundaries.length ? boundaries[i + 1] : lines.length;
        const chunkLines = lines.slice(startLine, endLine);
        let chunkContent = chunkLines.join('\n');

        // If the structural block is too large, sub-chunk it
        if (chunkContent.length > maxSize * 2) {
          const subChunks = this.splitLargeBlock(fileInfo, chunkLines, startLine, maxSize);
          chunks.push(...subChunks);
        } else {
          chunkContent = header + chunkContent;
          const chunk = this.createChunk(fileInfo, chunkContent, startLine, endLine);
          chunk.metadata = {
            ...chunk.metadata,
            functions: this.findContainedNames(chunkLines.join('\n'), functions),
            classes: this.findContainedNames(chunkLines.join('\n'), classes),
            imports: imports.length > 0 ? imports.slice(0, 10) : [],
          };
          chunks.push(chunk);
        }
      }
    } else {
      // Fall back to line-based chunking with overlap
      chunks.push(...this.chunkByLines(fileInfo, lines, maxSize, header, { functions, classes, imports }));
    }

    return chunks;
  }

  private static chunkByLines(
    fileInfo: FileInfo,
    lines: string[],
    maxSize: number,
    header: string,
    structuralInfo: { functions: string[]; classes: string[]; imports: string[] }
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    let currentChunkLines: string[] = [];
    let currentSize = 0;
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length + 1;

      if (currentSize + lineSize > maxSize && currentChunkLines.length > 0) {
        const chunkContent = header + currentChunkLines.join('\n');
        const chunk = this.createChunk(fileInfo, chunkContent, startLine, startLine + currentChunkLines.length);
        chunk.metadata = {
          ...chunk.metadata,
          functions: this.findContainedNames(currentChunkLines.join('\n'), structuralInfo.functions),
          classes: this.findContainedNames(currentChunkLines.join('\n'), structuralInfo.classes),
        };
        chunks.push(chunk);

        // Overlap: keep last few lines for context continuity
        const overlapLines = Math.min(5, currentChunkLines.length);
        currentChunkLines = currentChunkLines.slice(-overlapLines);
        startLine = i - overlapLines;
        currentSize = currentChunkLines.reduce((sum, l) => sum + l.length + 1, 0);
      }

      currentChunkLines.push(line);
      currentSize += lineSize;
    }

    // Last chunk
    if (currentChunkLines.length > 0) {
      const chunkContent = header + currentChunkLines.join('\n');
      const chunk = this.createChunk(fileInfo, chunkContent, startLine, startLine + currentChunkLines.length);
      chunk.metadata = {
        ...chunk.metadata,
        functions: this.findContainedNames(currentChunkLines.join('\n'), structuralInfo.functions),
        classes: this.findContainedNames(currentChunkLines.join('\n'), structuralInfo.classes),
      };
      chunks.push(chunk);
    }

    return chunks;
  }

  private static splitLargeBlock(
    fileInfo: FileInfo,
    blockLines: string[],
    baseStartLine: number,
    maxSize: number
  ): CodeChunk[] {
    const header = this.buildContextHeader(fileInfo);
    const subChunks: CodeChunk[] = [];
    let currentLines: string[] = [];
    let currentSize = 0;
    let startOffset = 0;

    for (let i = 0; i < blockLines.length; i++) {
      const line = blockLines[i];
      const lineSize = line.length + 1;

      if (currentSize + lineSize > maxSize && currentLines.length > 0) {
        const content = header + currentLines.join('\n');
        subChunks.push(this.createChunk(fileInfo, content, baseStartLine + startOffset, baseStartLine + startOffset + currentLines.length));
        const overlapLines = Math.min(3, currentLines.length);
        currentLines = currentLines.slice(-overlapLines);
        startOffset = i - overlapLines;
        currentSize = currentLines.reduce((sum, l) => sum + l.length + 1, 0);
      }

      currentLines.push(line);
      currentSize += lineSize;
    }

    if (currentLines.length > 0) {
      const content = header + currentLines.join('\n');
      subChunks.push(this.createChunk(fileInfo, content, baseStartLine + startOffset, baseStartLine + startOffset + currentLines.length));
    }

    return subChunks;
  }

  private static findStructuralBoundaries(lines: string[], language: string): number[] {
    const boundaries: number[] = [0]; // Always start at line 0

    const patterns: RegExp[] = [];
    switch (language) {
      case 'javascript':
      case 'typescript':
        patterns.push(
          /^(?:export\s+)?(?:async\s+)?function\s+\w+/,
          /^(?:export\s+)?(?:default\s+)?class\s+\w+/,
          /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/,
          /^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?function/,
          /^(?:export\s+)?interface\s+\w+/,
          /^(?:export\s+)?type\s+\w+/,
          /^(?:export\s+)?enum\s+\w+/,
        );
        break;
      case 'python':
        patterns.push(/^(?:class|def|async\s+def)\s+\w+/);
        break;
      case 'java':
      case 'kotlin':
        patterns.push(
          /^\s*(?:public|private|protected|static|\s)*(?:class|interface|enum)\s+\w+/,
          /^\s*(?:public|private|protected|static|\s)*\w+\s+\w+\s*\(/,
        );
        break;
      case 'go':
        patterns.push(/^func\s+/, /^type\s+\w+\s+struct/);
        break;
      case 'rust':
        patterns.push(/^(?:pub\s+)?(?:fn|struct|enum|trait|impl)\s+/);
        break;
      default:
        return []; // No structural splitting for unknown languages
    }

    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (patterns.some((p) => p.test(trimmed))) {
        // Don't add boundaries too close together (min 5 lines apart)
        const lastBoundary = boundaries[boundaries.length - 1];
        if (i - lastBoundary >= 5) {
          boundaries.push(i);
        }
      }
    }

    return boundaries;
  }

  private static buildContextHeader(fileInfo: FileInfo): string {
    return `// File: ${fileInfo.path} | Language: ${fileInfo.language}\n`;
  }

  private static findContainedNames(content: string, names: string[]): string[] {
    return names.filter((name) => content.includes(name));
  }

  private static chunkTextFile(fileInfo: FileInfo, maxSize: number): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const content = fileInfo.content;
    const header = this.buildContextHeader(fileInfo);

    let position = 0;

    while (position < content.length) {
      let chunkEnd = Math.min(position + maxSize, content.length);

      // Try to break at paragraph/sentence boundaries
      if (chunkEnd < content.length) {
        const lastDoubleNewline = content.lastIndexOf('\n\n', chunkEnd);
        const lastPeriod = content.lastIndexOf('. ', chunkEnd);
        const lastNewline = content.lastIndexOf('\n', chunkEnd);

        if (lastDoubleNewline > position + maxSize * 0.6) {
          chunkEnd = lastDoubleNewline + 2;
        } else if (lastPeriod > position + maxSize * 0.7) {
          chunkEnd = lastPeriod + 2;
        } else if (lastNewline > position + maxSize * 0.8) {
          chunkEnd = lastNewline;
        }
      }

      const chunkContent = header + content.substring(position, chunkEnd);
      chunks.push(this.createChunk(fileInfo, chunkContent, position, chunkEnd));

      // Move forward with overlap
      const nextPosition = chunkEnd;
      position = nextPosition;

      if (position < content.length) {
        position = Math.max(position - this.OVERLAP_SIZE, position - maxSize * 0.15);
      }
    }

    return chunks;
  }

  private static createChunk(
    fileInfo: FileInfo,
    content: string,
    startChar: number,
    endChar: number
  ): CodeChunk {
    const contentBeforeStart = fileInfo.content.substring(0, startChar);
    const contentBeforeEnd = fileInfo.content.substring(0, endChar);

    const startLine = (contentBeforeStart.match(/\n/g) || []).length;
    const endLine = (contentBeforeEnd.match(/\n/g) || []).length;

    return {
      id: `${fileInfo.path}-${startLine}-${endLine}`,
      fileId: fileInfo.path,
      content: content.trim(),
      startLine: startLine + 1,
      endLine: endLine + 1,
      metadata: {
        language: fileInfo.language,
        fileSize: fileInfo.size,
        fileName: fileInfo.name,
        extension: fileInfo.extension,
        filePath: fileInfo.path,
      },
    };
  }

  static shouldProcessFile(filePath: string, fileSize: number): boolean {
    // Skip very large files
    if (fileSize > 1024 * 1024) {
      // 1MB
      return false;
    }

    // Skip binary files and build artifacts
    const skipExtensions = [
      '.exe', '.dll', '.so', '.dylib', '.bin', '.jpg', '.png', '.gif',
      '.pdf', '.zip', '.tar', '.gz', '.ico', '.woff', '.woff2', '.ttf',
      '.svg', '.mp3', '.mp4', '.avi', '.mov', '.bmp', '.tiff',
      '.class', '.pyc', '.o', '.obj', '.a', '.lib',
    ];

    const extension = filePath.toLowerCase().split('.').pop() || '';
    if (skipExtensions.includes('.' + extension)) {
      return false;
    }

    // Skip common build and dependency directories
    const skipPaths = [
      'node_modules/', 'build/', 'dist/', '.git/', '.vscode/', '.idea/',
      '__pycache__/', '.next/', 'coverage/', 'vendor/', '.cache/',
      '.yarn/', '.pnp/', 'target/', 'out/',
    ];

    return !skipPaths.some((skipPath) => filePath.includes(skipPath));
  }
}