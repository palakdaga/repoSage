import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getSharedCoordinator } from '@/lib/agents/AntigravityCoordinator';

export async function POST(request: NextRequest) {
  try {
    const { repositoryUrl } = await request.json();

    if (!repositoryUrl) {
      return NextResponse.json(
        { error: 'Repository URL is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!repositoryUrl.match(/github\.com\/[^/]+\/[^/]+/)) {
      return NextResponse.json(
        { error: 'Invalid GitHub repository URL' },
        { status: 400 }
      );
    }

    // Get session for authenticated access
    const session = await getServerSession(authOptions);
    const accessToken = session?.accessToken as string | undefined;

    // Run full ANTIGRAVITY agent pipeline using shared coordinator
    const coordinator = getSharedCoordinator();
    const result = await coordinator.runPipeline({
      repositoryUrl,
      accessToken,
    });

    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error('Repository analysis failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze repository';

    if (message.includes('not found') || message.includes('access denied') || message.includes('Access denied')) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}