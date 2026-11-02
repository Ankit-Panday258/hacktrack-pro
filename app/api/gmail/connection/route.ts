import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth-session';
import { ensureGmailSchema, getGmailAccessToken, getGmailConnection, isGmailConfigured, removeGmailConnection } from '@/lib/server/gmail';
import { getTrackerDatabase } from '@/lib/server/my-hackathons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'Sign in to manage Gmail access.' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request.headers);
    if (!session) return unauthorized();
    const sql = getTrackerDatabase();
    await ensureGmailSchema(sql);
    const connection = await getGmailConnection(sql, session.user.id);
    return NextResponse.json({
      configured: isGmailConfigured(),
      connected: Boolean(connection),
      email: connection?.email || '',
      connectedAt: connection?.connectedAt || '',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Gmail connection status is temporarily unavailable.' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession(request.headers);
    if (!session) return unauthorized();
    const sql = getTrackerDatabase();
    await ensureGmailSchema(sql);

    let refreshToken: string | null = null;
    try { refreshToken = await removeGmailConnection(sql, session.user.id); }
    catch { /* The local connection is removed even if an old token can no longer be decrypted. */ }
    if (refreshToken) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
          cache: 'no-store',
        });
      } catch { /* The app no longer retains the token, so local access is already disabled. */ }
    }
    return NextResponse.json({ connected: false }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Could not disconnect Gmail right now.' }, { status: 503 });
  }
}
