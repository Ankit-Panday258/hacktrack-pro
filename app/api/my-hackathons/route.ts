import { NextRequest, NextResponse } from 'next/server';
import { HackathonStatus, TrackedHackathon } from '@/lib/my-hackathons';
import {
  appendActivity, cleanText, cleanUrl, ensureTrackerSchema, getOwnerId, getTrackerDatabase,
  isHackathonStatus, loadTracker, statusActivity, TrackerUnavailableError, withOwnerCookie,
} from '@/lib/server/my-hackathons';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function failure(error: unknown) {
  if (error instanceof TrackerUnavailableError) return NextResponse.json({ records: [], activity: [], error: error.message }, { status: 503 });
  return NextResponse.json({ records: [], activity: [], error: 'Cloud tracker is temporarily unavailable. Please try again.' }, { status: 503 });
}

export async function GET(request: NextRequest) {
  const { ownerId, needsCookie } = getOwnerId(request);
  try {
    const sql = getTrackerDatabase();
    await ensureTrackerSchema(sql);
    const result = await loadTracker(sql, ownerId);
    return withOwnerCookie(NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } }), ownerId, needsCookie);
  } catch (error) {
    return withOwnerCookie(failure(error), ownerId, needsCookie);
  }
}

export async function POST(request: NextRequest) {
  const { ownerId, needsCookie } = getOwnerId(request);
  try {
    const body = await request.json() as { action?: string; record?: Partial<TrackedHackathon>; recordId?: string; patch?: Partial<TrackedHackathon> };
    const sql = getTrackerDatabase();
    await ensureTrackerSchema(sql);

    if (body.action === 'add') {
      const input = body.record || {};
      const title = cleanText(input.title, 240);
      if (!title) return withOwnerCookie(NextResponse.json({ records: [], activity: [], error: 'Hackathon name is required.' }, { status: 400 }), ownerId, needsCookie);
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
      if (!updated.length) return withOwnerCookie(NextResponse.json({ records: [], activity: [], error: 'Hackathon record was not found.' }, { status: 404 }), ownerId, needsCookie);
      const updatedRecord = updated[0];
      await appendActivity(sql, ownerId, updatedRecord.id, updatedRecord.title, status ? statusActivity(status) : 'Updated project or reward details');
    } else if (body.action === 'delete') {
      const recordId = cleanText(body.recordId, 50);
      const removed = await sql`DELETE FROM hacktrack_records WHERE id = ${recordId} AND owner_id = ${ownerId} RETURNING id::text AS id, title` as unknown as { id: string; title: string }[];
      if (!removed.length) return withOwnerCookie(NextResponse.json({ records: [], activity: [], error: 'Hackathon record was not found.' }, { status: 404 }), ownerId, needsCookie);
      await appendActivity(sql, ownerId, removed[0].id, removed[0].title, 'Removed from your tracker');
    } else {
      return withOwnerCookie(NextResponse.json({ records: [], activity: [], error: 'Unsupported tracker action.' }, { status: 400 }), ownerId, needsCookie);
    }

    const result = await loadTracker(sql, ownerId);
    return withOwnerCookie(NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } }), ownerId, needsCookie);
  } catch (error) {
    return withOwnerCookie(failure(error), ownerId, needsCookie);
  }
}
