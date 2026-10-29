import { NextResponse } from 'next/server';
import { getHackathonData } from '@/lib/hackathons';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await getHackathonData(), { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } }); }
  catch (error) { return NextResponse.json({ syncedAt: null, tabs: { Hackathons: [] }, sources: {}, error: error instanceof Error ? error.message : 'Could not read discovery sources.' }, { status: 502 }); }
}
