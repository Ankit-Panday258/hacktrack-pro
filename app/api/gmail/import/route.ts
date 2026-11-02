import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth-session';
import { HackathonStatus } from '@/lib/my-hackathons';
import { appendActivity, cleanText, ensureTrackerSchema, getTrackerDatabase, isHackathonStatus, statusActivity } from '@/lib/server/my-hackathons';
import { ensureGmailSchema, getGmailAccessToken, getGmailConnection, GmailIntegrationError, getGmailMessage, gmailTitleSourceId, isGmailConfigured, updateRefreshTokenIfRotated } from '@/lib/server/gmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ImportSelection = { id?: unknown; title?: unknown; status?: unknown };

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request.headers);
    if (!session) return NextResponse.json({ error: 'Sign in before importing Gmail matches.' }, { status: 401 });
    if (!isGmailConfigured()) return NextResponse.json({ error: 'Gmail OAuth is not configured yet.' }, { status: 503 });

    const body = await request.json().catch(() => ({})) as { selections?: unknown };
    if (!Array.isArray(body.selections) || body.selections.length < 1 || body.selections.length > 25) {
      return NextResponse.json({ error: 'Select between 1 and 25 email matches to import.' }, { status: 400 });
    }
    const sql = getTrackerDatabase();
    await Promise.all([ensureTrackerSchema(sql), ensureGmailSchema(sql)]);
    const connection = await getGmailConnection(sql, session.user.id);
    if (!connection) return NextResponse.json({ error: 'Connect Gmail before importing.' }, { status: 409 });
    const { accessToken, refreshToken } = await getGmailAccessToken(connection);
    await updateRefreshTokenIfRotated(sql, session.user.id, refreshToken);

    let imported = 0;
    let skipped = 0;
    for (const raw of body.selections as ImportSelection[]) {
      const id = typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(raw.id) ? raw.id : '';
      if (!id) { skipped += 1; continue; }
      const candidate = await getGmailMessage(accessToken, id).catch(() => null);
      if (!candidate) { skipped += 1; continue; }

      const title = cleanText(raw.title, 240) || candidate.title;
      const status: HackathonStatus = isHackathonStatus(raw.status) ? raw.status : candidate.suggestedStatus;
      const sourceId = gmailTitleSourceId(title, candidate.from, candidate.id);
      const recordId = crypto.randomUUID();
      const rows = await sql`INSERT INTO hacktrack_records (id, owner_id, source_id, title, organizer, url, deadline, prize, status)
        VALUES (${recordId}, ${session.user.id}, ${sourceId}, ${title}, ${cleanText(candidate.from, 240)}, '', '', '', ${status})
        ON CONFLICT (owner_id, source_id) WHERE source_id <> '' DO NOTHING RETURNING id::text AS id` as unknown as Array<{ id: string }>;
      if (rows.length) {
        imported += 1;
        await appendActivity(sql, session.user.id, recordId, title, statusActivity(status));
      } else {
        skipped += 1;
      }
    }

    return NextResponse.json({ imported, skipped }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof GmailIntegrationError ? error.message : 'Could not import those Gmail matches. Please try again.';
    return NextResponse.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
