import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getAuthSession } from '@/lib/server/auth-session';
import { createOAuthRequest, ensureGmailSchema, getGmailRedirectUri, GMAIL_OAUTH_COOKIE, GMAIL_SCOPE, isGmailConfigured, sealOAuthCookie } from '@/lib/server/gmail';
import { getTrackerDatabase, isTrackerOwnerId } from '@/lib/server/my-hackathons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function returnToTracker(request: NextRequest, status: string) {
  const base = process.env.BETTER_AUTH_URL || request.nextUrl.origin;
  return NextResponse.redirect(new URL(`/my-hackathons?gmail=${encodeURIComponent(status)}`, base));
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request.headers);
    if (!session) return NextResponse.redirect(new URL('/sign-in?next=%2Fmy-hackathons', request.nextUrl.origin));
    if (!isTrackerOwnerId(session.user.id)) return returnToTracker(request, 'error');
    if (!isGmailConfigured()) return returnToTracker(request, 'setup');

    const sql = getTrackerDatabase();
    await ensureGmailSchema(sql);

    const { state, verifier, challenge } = createOAuthRequest();
    const redirectUri = getGmailRedirectUri(request.nextUrl.origin);
    const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorizationUrl.search = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: `openid email ${GMAIL_SCOPE}`,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent select_account',
    }).toString();

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(GMAIL_OAUTH_COOKIE, sealOAuthCookie({
      state,
      verifier,
      ownerId: session.user.id,
      expiresAt: Date.now() + 10 * 60 * 1000,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/gmail/callback',
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return returnToTracker(request, 'setup');
  }
}
