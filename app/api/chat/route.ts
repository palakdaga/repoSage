import { NextRequest } from 'next/server';
import { getSharedRagPipeline } from '@/lib/agents/AntigravityCoordinator';
import { RAGPipeline } from '@/lib/services/RAGPipeline';
import { getSharedGroqService } from '@/lib/services/GroqService';
import { buildGitHubContext } from '@/lib/services/GitHubContextBuilder';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatSession {
  sessionId: string;
  repositoryId: string;
  repoUrl?: string;
  cachedContext?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage for chat sessions
const chatSessions = new Map<string, ChatSession>();

function getRagPipeline(): RAGPipeline {
  return getSharedRagPipeline();
}

/**
 * POST /api/chat — Streaming chat endpoint using Server-Sent Events.
 *
 * Context priority:
 *  1. RAG VectorDB (if repo is indexed)
 *  2. GitHub API (fetches repo files directly — like f/server.py)
 *  3. No context (general AI response)
 *
 * LLM priority:
 *  1. Groq API (fast cloud inference)
 *  2. Ollama (local fallback)
 */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, repositoryId, message, repoUrl } = await request.json();

    if (!sessionId || !repositoryId || !message) {
      return new Response(
        JSON.stringify({ error: 'Session ID, repository ID, and message are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get or create chat session
    let session = chatSessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        repositoryId,
        repoUrl: repoUrl || undefined,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      chatSessions.set(sessionId, session);
    }

    // Update repoUrl if provided
    if (repoUrl && !session.repoUrl) {
      session.repoUrl = repoUrl;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    session.messages.push(userMessage);
    session.updatedAt = new Date();

    // Build chat history (last 6 messages for context without bloat)
    const chatHistory = session.messages.slice(-6).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const ragPipeline = getRagPipeline();
    const isIndexed = ragPipeline.isRepositoryIndexed(repositoryId);
    const groq = getSharedGroqService();
    const useGroq = groq.isAvailable();

    // ── Build context ────────────────────────────────────────
    let contextText = '';

    // Strategy 1: RAG VectorDB
    if (isIndexed) {
      const vectorDB = ragPipeline.getVectorDB();
      const relevantChunks = await vectorDB.similaritySearch(repositoryId, message, 12);
      if (relevantChunks.length > 0) {
        contextText = relevantChunks
          .map((c, i) => {
            const file = (c.metadata.fileId || c.metadata.filePath || 'unknown') as string;
            const lines =
              c.metadata.startLine && c.metadata.endLine
                ? ` (L${c.metadata.startLine}-L${c.metadata.endLine})`
                : '';
            const score = (c.score * 100).toFixed(0);
            return `--- Context ${i + 1} [${file}${lines}] (relevance: ${score}%) ---\n${c.content}`;
          })
          .join('\n\n');
      }
    }

    // Strategy 2: GitHub API (if no RAG context, fetch from GitHub)
    if (!contextText && repositoryId.includes('/')) {
      try {
        // Use cached context if available
        if (session.cachedContext) {
          contextText = session.cachedContext;
        } else {
          const { context } = await buildGitHubContext(repositoryId);
          contextText = context;
          session.cachedContext = context; // cache for future messages
        }
      } catch (err) {
        console.warn('[Chat] GitHub context fetch failed:', err);
      }
    }

    const diagramRules = `
## Diagram Guidelines (Mermaid Syntax):
When asked to create a diagram, wrap it in a \`\`\`mermaid code fence.

### Flowchart / Graph:
\`\`\`
flowchart TD
  A["Label A"] --> B["Label B"]
  B --> C["Label C"]
\`\`\`

### Sequence Diagram:
\`\`\`
sequenceDiagram
  participant User
  participant Server
  User ->> Server: Request
  Server -->> User: Response
\`\`\`

### Class Diagram:
\`\`\`
classDiagram
  class ClassName {
    +method()
    -field: type
  }
\`\`\`

### State Diagram:
\`\`\`
stateDiagram-v2
  [*] --> Active
  Active --> Inactive
  note right of Active : This is a note
\`\`\`
IMPORTANT for State Diagrams: Notes MUST use "note right of StateName : text" or "note left of StateName : text". NEVER write bare "note" without "right of" or "left of".

## CRITICAL Mermaid Rules — FOLLOW STRICTLY:
1. Node IDs must be simple alphanumeric with underscores ONLY (e.g. MY_NODE, step1, genFunc)
2. Put labels in double quotes inside brackets: NODE_ID["My Label"]
3. NEVER use <, >, &, or unescaped special chars in labels
4. NEVER use pipe characters | inside node labels
5. Always close all brackets [] {} ()
6. Keep labels short (under 30 chars)
7. Use proper arrow syntax: --> for flowchart, ->> for sequence
8. Each node definition must appear on its own line
9. Do NOT nest mermaid fences or add extra backticks
10. If the diagram would be too complex (>20 nodes), split into multiple simpler diagrams`;

    const systemPrompt = contextText
      ? `You are RepoSage AI, an expert code analyst. Answer ONLY from the provided code context. Be precise and include code examples when relevant.

Format responses with markdown.
${diagramRules}

Always validate your diagrams are syntactically correct before including them.`
      : `You are RepoSage AI, an expert code analyst. Help users understand the repository they are asking about. If you do not have specific code context, provide general guidance.

Format responses with markdown.
${diagramRules}`;

    // Create a streaming response using SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = '';

        try {
          // Build the user message with context
          const augmentedMessage = contextText
            ? `${contextText}\n\nQ: ${message}`
            : message;

          const messagesForLLM = [
            ...chatHistory.slice(0, -1), // history minus the current message
            { role: 'user' as const, content: augmentedMessage },
          ];

          if (useGroq) {
            // ── Fast path: Groq API ──────────────────────────
            for await (const token of groq.chatStream(messagesForLLM, systemPrompt)) {
              fullContent += token;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token, type: 'token' })}\n\n`)
              );
            }
          } else if (isIndexed) {
            // ── Fallback: Ollama via RAG pipeline ────────────
            for await (const token of ragPipeline.queryStream(repositoryId, message, chatHistory)) {
              fullContent += token;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token, type: 'token' })}\n\n`)
              );
            }
          } else {
            // ── Fallback: Ollama direct ──────────────────────
            for await (const token of ragPipeline.getOllama().chatStream(
              [{ role: 'user' as const, content: augmentedMessage }],
              systemPrompt
            )) {
              fullContent += token;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ token, type: 'token' })}\n\n`)
              );
            }
          }

          // Store the full assistant message in session
          const assistantMessage: ChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            role: 'assistant',
            content: fullContent,
            timestamp: new Date(),
          };
          session!.messages.push(assistantMessage);
          session!.updatedAt = new Date();

          // Send done event with the full message
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'done',
                message: assistantMessage,
                userMessage,
              })}\n\n`
            )
          );
        } catch (err) {
          console.error('Chat stream error:', err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: 'Failed to generate response' })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat message' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Session ID is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const session = chatSessions.get(sessionId);
    if (!session) {
      return new Response(JSON.stringify({ sessionId, messages: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        sessionId: session.sessionId,
        repositoryId: session.repositoryId,
        messages: session.messages,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Chat GET error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve chat session' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}