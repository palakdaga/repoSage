/**
 * Validates and fixes common Mermaid diagram syntax errors.
 * Handles LLM-generated diagrams that often contain syntax issues.
 */

interface ValidationResult {
  isValid: boolean;
  fixed: string;
  errors: string[];
  warnings: string[];
}

// All diagram types Mermaid supports (lowercased for matching)
const KNOWN_DIAGRAM_TYPES: Record<string, string> = {
  flowchart: 'flowchart',
  graph: 'graph',
  sequencediagram: 'sequenceDiagram',
  classdiagram: 'classDiagram',
  'statediagram-v2': 'stateDiagram',
  statediagram: 'stateDiagram',
  erdiagram: 'erDiagram',
  gantt: 'gantt',
  pie: 'pie',
  gitgraph: 'gitGraph',
  mindmap: 'mindmap',
  timeline: 'timeline',
  journey: 'journey',
  requirementdiagram: 'requirementDiagram',
  c4context: 'C4Context',
  c4container: 'C4Container',
  c4component: 'C4Component',
  c4dynamic: 'C4Dynamic',
  c4deployment: 'C4Deployment',
  sankey: 'sankey',
  'block-beta': 'block-beta',
  xychart: 'xychart',
  quadrantchart: 'quadrantChart',
};

export class MermaidValidator {
  /**
   * Validate mermaid code and attempt fixes for common issues
   */
  static validate(code: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let fixed = this.sanitizeCode(code);

    // Check for empty code
    if (!fixed || fixed.length === 0) {
      errors.push('Diagram code is empty');
      return { isValid: false, fixed, errors, warnings };
    }

    // Detect diagram type
    const diagramType = this.detectDiagramType(fixed);
    if (!diagramType) {
      // Instead of rejecting, let mermaid.js try to parse it
      warnings.push('Could not detect diagram type — will attempt to render as-is');
      return { isValid: true, fixed, errors, warnings };
    }

    // Type-specific validation
    switch (diagramType) {
      case 'flowchart':
      case 'graph':
        fixed = this.validateFlowchart(fixed, errors, warnings);
        break;
      case 'classDiagram':
        fixed = this.validateClassDiagram(fixed, errors, warnings);
        break;
      case 'sequenceDiagram':
        fixed = this.validateSequenceDiagram(fixed, errors, warnings);
        break;
      case 'stateDiagram':
        fixed = this.validateStateDiagram(fixed, errors, warnings);
        break;
      // Other types: pass through without specific validation
    }

    return {
      isValid: errors.length === 0,
      fixed,
      errors,
      warnings,
    };
  }

  /**
   * Sanitize common LLM output issues
   */
  private static sanitizeCode(code: string): string {
    let cleaned = code.trim();

    // Remove stray markdown backtick fences that LLMs sometimes include
    cleaned = cleaned.replace(/^```\s*mermaid\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');

    // Remove HTML entities that LLMs sometimes use
    cleaned = cleaned.replace(/&gt;/g, '>');
    cleaned = cleaned.replace(/&lt;/g, '<');
    cleaned = cleaned.replace(/&amp;/g, '&');
    cleaned = cleaned.replace(/&quot;/g, '"');
    cleaned = cleaned.replace(/&#39;/g, "'");

    // Remove zero-width characters
    cleaned = cleaned.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // Normalise line endings
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove trailing whitespace on each line
    cleaned = cleaned
      .split('\n')
      .map((l) => l.trimEnd())
      .join('\n');

    return cleaned.trim();
  }

  /**
   * Detect the diagram type (case-insensitive matching)
   */
  private static detectDiagramType(code: string): string | null {
    const firstLine = code.split('\n')[0].trim();
    // Extract the first word/token from the first line
    const firstToken = firstLine.split(/[\s({]/)[0].toLowerCase();

    // Direct lookup
    if (KNOWN_DIAGRAM_TYPES[firstToken]) {
      return KNOWN_DIAGRAM_TYPES[firstToken];
    }

    // Check if the first line *starts with* a known type (e.g. "flowchart TD")
    const lowerLine = firstLine.toLowerCase();
    for (const [key, canonical] of Object.entries(KNOWN_DIAGRAM_TYPES)) {
      if (lowerLine.startsWith(key)) {
        return canonical;
      }
    }

    return null;
  }

  /**
   * Validate flowchart/graph syntax
   */
  private static validateFlowchart(code: string, errors: string[], warnings: string[]): string {
    let fixed = code;

    // 1. Ensure proper spacing around arrows
    fixed = fixed.replace(/([A-Za-z0-9_\]}")])(\s*)(-->|==>|-.->|---)(\s*)([A-Za-z0-9_\[{("|])/g,
      (_, before, _s1, arrow, _s2, after) => `${before} ${arrow} ${after}`);

    // 2. Fix unclosed brackets in node labels
    const lines = fixed.split('\n');
    const fixedLines = lines.map((line) => {
      // Fix unclosed square brackets
      const openSquare = (line.match(/\[/g) || []).length;
      const closeSquare = (line.match(/\]/g) || []).length;
      if (openSquare > closeSquare) {
        line += ']'.repeat(openSquare - closeSquare);
        warnings.push('Fixed unclosed bracket in: ' + line.trim().substring(0, 40));
      }

      // Fix unclosed curly brackets
      const openCurly = (line.match(/{/g) || []).length;
      const closeCurly = (line.match(/}/g) || []).length;
      if (openCurly > closeCurly) {
        line += '}'.repeat(openCurly - closeCurly);
        warnings.push('Fixed unclosed curly bracket');
      }

      // Fix unclosed parentheses
      const openParen = (line.match(/\(/g) || []).length;
      const closeParen = (line.match(/\)/g) || []).length;
      if (openParen > closeParen) {
        line += ')'.repeat(openParen - closeParen);
        warnings.push('Fixed unclosed parenthesis');
      }

      return line;
    });
    fixed = fixedLines.join('\n');

    // 3. Fix node IDs with spaces (replace with underscores)
    fixed = fixed.split('\n').map((line) => {
      if (line.match(/^\s+[A-Za-z0-9 ]+\[/)) {
        const parts = line.split('[');
        const nodeId = parts[0].trim();
        if (nodeId.includes(' ') && !nodeId.includes('subgraph') && !nodeId.includes('end')) {
          const fixedId = nodeId.replace(/\s+/g, '_');
          warnings.push(`Node ID "${nodeId}" has spaces → renamed to "${fixedId}"`);
          return line.replace(nodeId, fixedId);
        }
      }
      return line;
    }).join('\n');

    return fixed;
  }

  /**
   * Validate class diagram syntax
   */
  private static validateClassDiagram(code: string, errors: string[], warnings: string[]): string {
    let fixed = code;

    const lines = fixed.split('\n');
    const validatedLines = lines.map((line, idx) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('class') && !trimmed.startsWith('--') && /^[A-Z].*{/m.test(trimmed)) {
        warnings.push(`Line ${idx + 1}: Consider using "class" keyword for class definitions`);
      }
      return line;
    });
    fixed = validatedLines.join('\n');

    return fixed;
  }

  /**
   * Validate sequence diagram syntax
   */
  private static validateSequenceDiagram(code: string, errors: string[], warnings: string[]): string {
    let fixed = code;

    const participantPattern = /participant\s+(\w+)\s*:\s*(.+)/;
    fixed = fixed.split('\n').map((line) => {
      if (line.includes('participant') && !line.match(participantPattern)) {
        const match = line.match(/participant\s+(.+)/);
        if (match) {
          return `participant ${match[1]}`;
        }
      }
      return line;
    }).join('\n');

    return fixed;
  }

  /**
   * Validate state diagram syntax — fix common LLM issues
   */
  private static validateStateDiagram(code: string, errors: string[], warnings: string[]): string {
    let fixed = code;

    const lines = fixed.split('\n');
    let lastState = '';

    fixed = lines.map((line) => {
      const trimmed = line.trim();

      // Track the last state name for note attachment
      const arrowMatch = trimmed.match(/^(\w+)\s*-->/);
      if (arrowMatch) lastState = arrowMatch[1];

      const toMatch = trimmed.match(/-->\s*(\w+)/);
      if (toMatch) lastState = toMatch[1];

      // Fix bare "note" lines: note "text" → note right of LastState : text
      // Patterns LLMs produce:
      //   note "some text"
      //   note 'some text'
      //   note some text
      if (/^\s*note\s+/i.test(line) && !/note\s+(right|left)\s+of/i.test(line)) {
        // Extract the text after "note"
        const noteMatch = trimmed.match(/^note\s+["']?(.*?)["']?\s*$/i);
        if (noteMatch && noteMatch[1]) {
          const noteText = noteMatch[1];
          if (lastState) {
            warnings.push(`Fixed note syntax: attached to state "${lastState}"`);
            return `    note right of ${lastState} : ${noteText}`;
          } else {
            // No state to attach to — remove the invalid note
            warnings.push('Removed orphan note (no state to attach to)');
            return '';
          }
        }
      }

      // Fix arrow spacing
      if (trimmed.includes('-->')) {
        const parts = trimmed.split('-->');
        if (parts.length === 2) {
          return `  ${parts[0].trim()} --> ${parts[1].trim()}`;
        }
      }

      return line;
    }).join('\n');

    return fixed;
  }

  /**
   * Generate a fallback simple diagram
   */
  static generateFallback(intent: string = 'architecture'): string {
    const fallbacks: { [key: string]: string } = {
      architecture: `graph LR
  A["Client"] --> B["API"]
  B --> C["Database"]
  style A fill:#6c5ce7
  style B fill:#00cec9
  style C fill:#a29bfe`,

      flow: `flowchart TD
  A["Start"] --> B["Process"]
  B --> C["End"]
  style A fill:#6c5ce7
  style C fill:#a29bfe`,

      class: `classDiagram
  class MyClass {
    +attribute: string
    +method()
  }`,

      sequence: `sequenceDiagram
  participant User
  participant System
  User ->> System: Request
  System -->> User: Response`,
    };

    return fallbacks[intent] || fallbacks.architecture;
  }
}
