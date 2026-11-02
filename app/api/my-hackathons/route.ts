import { NextRequest, NextResponse } from 'next/server';
import { HackathonStatus, TrackedHackathon } from '@/lib/my-hackathons';
import { getAuthSession } from '@/lib/server/auth-session';
import {
  appendActivity, claimGuestRecords, cleanText, cleanUrl, ensureTrackerSchema, getTrackerDatabase,
  isHackathonStatus, isTrackerOwnerId, LEGACY_OWNER_COOKIE, loadTracker, statusActivity, TrackerUnavailableError,
} from '@/lib/server/my-hackathons';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function failure(error: unknown) {
  if (error instanceof TrackerUnavailableError) return NextResponse.json({ error: error.message }, { status: 503 });
  return NextResponse.json({ error: 'Cloud tracker is temporarily unavailable. Please try again.' }, { status: 503 });
}

function signedOut() {
  return NextResponse.json({ records: [], activity: [], error: 'Please sign in with Google to save and manage your hackathons.' }, {
    status: 401,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function trackerResponse(result: { records: TrackedHackathon[]; activity: import('@/lib/my-hackathons').TrackerActivity[] }, clearLegacyCookie: boolean) {
  const response = NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  if (clearLegacyCookie) response.cookies.delete(LEGACY_OWNER_COOKIE);
  return response;
}

async function migrateGuestRecords(request: NextRequest, sql: ReturnType<typeof getTrackerDatabase>, ownerId: string) {
  const guestOwnerId = request.cookies.get(LEGACY_OWNER_COOKIE)?.value || '';
  if (guestOwnerId && guestOwnerId !== ownerId) await claimGuestRecords(sql, guestOwnerId, ownerId);
  return Boolean(guestOwnerId);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession(request.headers);
    if (!session) return signedOut();
    const ownerId = session.user.id;
    if (!isTrackerOwnerId(ownerId)) return failure(new Error('Unexpected account identifier format.'));

    const sql = getTrackerDatabase();
    await ensureTrackerSchema(sql);
    const clearLegacyCookie = await migrateGuestRecords(request, sql, ownerId);
    return trackerResponse(await loadTracker(sql, ownerId), clearLegacyCookie);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession(request.headers);
    if (!session) return signedOut();
    const ownerId = session.user.id;
    if (!isTrackerOwnerId(ownerId)) return failure(new Error('Unexpected account identifier format.'));

    const body = await request.json() as { action?: string; record?: Partial<TrackedHackathon>; recordId?: string; patch?: Partial<TrackedHackathon> };
    const sql = getTrackerDatabase();
    await ensureTrackerSchema(sql);
    const clearLegacyCookie = await migrateGuestRecords(request, sql, ownerId);

    if (body.action === 'add') {
      const input = body.record || {};
      const title = cleanText(input.title, 240);
      if (!title) return NextResponse.json({ records: [], activity: [], error: 'Hackathon name is required.' }, { status: 400 });
      const sourceId = cleanText(input.sourceId, 400);
      const id = crypto.randomUUID();
      const inserted = await sql`INSERT INTO hacktrack_records (id, owner_id, source_id, title, organizer, url, deadline, prize, status)
        VALUES (${id}, ${ownerId}, ${sourceId}, ${title}, ${cleanText(input.organizer, 240)}, ${cleanUrl(input.url)}, ${cleanText(input.deadline, 300)}, ${cleanText(input.prize, 500)}, 'saved')
        ON CONFLICT (owner_id, source_id) WHERE source_id <> '' DO NOTHING RETURNING id` as unknown as { id: string }[];
      if (inserted.length) await appendActivity(sql, ownerId, id, title, 'Added to your tracker');
    } else if (body.action === 'update') {
      const recordId = cleanText(body.recordId, 50);
      const patch = body.patch || {};
      const status = isHackathonStatus(patch.status) ? patch.status : null;
      const projectName = typeof patch.projectName === 'string' ? cleanText(patch.projectName, 240) : null;
      const projectUrl = typeof patch.projectUrl === 'string' ? cleanUrl(patch.projectUrl) : null;
      const resultNotes = typeof patch.resultNotes === 'string' ? cleanText(patch.resultNotes, 4000) : null;
      const prizeReceived = typeof patch.prizeReceived === 'string' ? cleanText(patch.prizeReceived, 500) : null;
      const certificateUrl = typeof patch.certificateUrl === 'string' ? cleanUrl(patch.certificateUrl) : null;
      const updated = await sql`UPDATE hacktrack_records SET
        status = COALESCE(${status}, status), project_name = COALESCE(${projectName}, project_name), project_url = COALESCE(${projectUrl}, project_url),
        result_notes = COALESCE(${resultNotes}, result_notes), prize_received = COALESCE(${prizeReceived}, prize_received),
        certificate_url = COALESCE(${certificateUrl}, certificate_url), updated_at = now()
        WHERE id = ${recordId} AND owner_id = ${ownerId} RETURNING id::text AS id, title, status` as unknown as { id: string; title: string; status: HackathonStatus }[];
      if (!updated.length) return NextResponse.json({ records: [], activity: [], error: 'Hackathon record was not found.' }, { status: 404 });
      const updatedRecord = updated[0];
      await appendActivity(sql, ownerId, updatedRecord.id, updatedRecord.title, status ? statusActivity(status) : 'Updated project or reward details');
    } else if (body.action === 'delete') {
      const recordId = cleanText(body.recordId, 50);
      const removed = await sql`DELETE FROM hacktrack_records WHERE id = ${recordId} AND owner_id = ${ownerId} RETURNING id::text AS id, title` as unknown as { id: string; title: string }[];
      if (!removed.length) return NextResponse.json({ records: [], activity: [], error: 'Hackathon record was not found.' }, { status: 404 });
      await appendActivity(sql, ownerId, removed[0].id, removed[0].title, 'Removed from your tracker');
    } else {
      return NextResponse.json({ records: [], activity: [], error: 'Unsupported tracker action.' }, { status: 400 });
    }

    return trackerResponse(await loadTracker(sql, ownerId), clearLegacyCookie);
  } catch (error) {
    return failure(error);
  }
}
