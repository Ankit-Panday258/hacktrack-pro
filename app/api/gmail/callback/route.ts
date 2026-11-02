import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth-session';
import { ensureGmailSchema, getGmailRedirectUri, gmailProfileEmail, GMAIL_OAUTH_COOKIE, GMAIL_SCOPE, isGmailConfigured, openOAuthCookie, saveGmailConnection, stateMatches } from '@/lib/server/gmail';
import { getTrackerDatabase } from '@/lib/server/my-hackathons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function finish(request: NextRequest, status: string) {
  const base = process.env.BETTER_AUTH_URL || request.nextUrl.origin;
  const response = NextResponse.redirect(new URL(`/my-hackathons?gmail=${encodeURIComponent(status)}`, base));
  response.cookies.set(GMAIL_OAUTH_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/gmail/callback',
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const googleError = request.nextUrl.searchParams.get('error');
  if (googleError === 'access_denied') return finish(request, 'denied');
  if (googleError) return finish(request, 'error');

  try {
    if (!isGmailConfigured()) return finish(request, 'setup');
    const code = request.nextUrl.searchParams.get('code') || '';
    const state = request.nextUrl.searchParams.get('state') || '';
    const cookie = request.cookies.get(GMAIL_OAUTH_COOKIE)?.value || '';
    const oauth = cookie ? openOAuthCookie(cookie) : null;
    if (!code || !oauth || !stateMatches(oauth.state, state)) return finish(request, 'error');

    const session = await getAuthSession(request.headers);
    if (!session || session.user.id !== oauth.ownerId) return finish(request, 'error');

    const redirectUri = getGmailRedirectUri(request.nextUrl.origin);
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: oauth.verifier,
      }),
      cache: 'no-store',
    });
    const tokens = await tokenResponse.json().catch(() => null) as { access_token?: string; refresh_token?: string; scope?: string } | null;
    if (!tokenResponse.ok || !tokens?.access_token || !tokens.refresh_token) return finish(request, 'error');

    const scopes = tokens.scope || GMAIL_SCOPE;
    if (!scopes.split(/\s+/).includes(GMAIL_SCOPE)) return finish(request, 'error');
    const email = await gmailProfileEmail(tokens.access_token);
    const sql = getTrackerDatabase();
    await ensureGmailSchema(sql);
    await saveGmailConnection(sql, session.user.id, email, tokens.refresh_token, scopes);
    return finish(request, 'connected');
  } catch {
    return finish(request, 'error');
  }
}
