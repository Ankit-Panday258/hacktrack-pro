import { NextResponse } from 'next/server';
import { getSheetData } from '@/lib/sheets';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(await getSheetData(), { headers: { 'Cache-Control': 'private, max-age=0, must-revalidate' } }); }
  catch (error) { return NextResponse.json({ configured: true, syncedAt: null, tabs: {}, error: error instanceof Error ? error.message : 'Could not read Google Sheets.' }, { status: 502 }); }
}
