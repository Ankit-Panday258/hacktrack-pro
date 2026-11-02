import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth-session';
import { ensureGmailSchema, getGmailAccessToken, getGmailConnection, GmailIntegrationError, isGmailConfigured, scanGmail, updateRefreshTokenIfRotated } from '@/lib/server/gmail';
import { getTrackerDatabase } from '@/lib/server/my-hackathons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request.headers);
    if (!session) return NextResponse.json({ error: 'Sign in before scanning Gmail.' }, { status: 401 });
    if (!isGmailConfigured()) return NextResponse.json({ error: 'Gmail OAuth is not configured yet.' }, { status: 503 });

    const body = await request.json().catch(() => ({})) as { pageToken?: unknown };
    const pageToken = typeof body.pageToken === 'string' ? body.pageToken.slice(0, 2048) : null;
    const sql = getTrackerDatabase();
    await ensureGmailSchema(sql);
    const connection = await getGmailConnection(sql, session.user.id);
    if (!connection) return NextResponse.json({ error: 'Connect Gmail before scanning.' }, { status: 409 });

    const { accessToken, refreshToken } = await getGmailAccessToken(connection);
    await updateRefreshTokenIfRotated(sql, session.user.id, refreshToken);
    const result = await scanGmail(accessToken, pageToken);
    return NextResponse.json({ ...result, email: connection.email }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof GmailIntegrationError ? error.message : 'Gmail scan failed. Please try again.';
    return NextResponse.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
