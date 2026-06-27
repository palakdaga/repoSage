import { NextRequest, NextResponse } from 'next/server';
import { AntigravityCoordinator } from '@/lib/agents/AntigravityCoordinator';

// In-memory store for active coordinators — scoped to this module
const activeCoordinators = new Map<string, AntigravityCoordinator>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const analysisId = searchParams.get('id');

  if (analysisId) {
    const coordinator = activeCoordinators.get(analysisId);
    if (coordinator) {
      return NextResponse.json(coordinator.getStatus());
    }
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  // Return all active analysis statuses
  const statuses: Record<string, unknown> = {};
  for (const [id, coord] of activeCoordinators.entries()) {
    statuses[id] = coord.getStatus();
  }

  return NextResponse.json({ analyses: statuses });
}
