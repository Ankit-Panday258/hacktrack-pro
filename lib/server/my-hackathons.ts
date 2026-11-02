import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';
import { HackathonStatus, statusLabels, TrackedHackathon, TrackerActivity, TrackerResponse } from '@/lib/my-hackathons';

const OWNER_COOKIE = 'hacktrack_guest';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validStatuses = new Set<HackathonStatus>(['saved', 'registered', 'participating', 'submitted', 'awaiting_results', 'won', 'lost']);
let database: ReturnType<typeof neon> | undefined;
let schemaReady: Promise<void> | undefined;

export class TrackerUnavailableError extends Error {}

export function getTrackerDatabase() {
  if (!process.env.DATABASE_URL) throw new TrackerUnavailableError('Cloud storage is not connected yet. Attach the free Neon database to the Vercel project.');
  if (!database) database = neon(process.env.DATABASE_URL);
  return database;
}

export function ensureTrackerSchema(sql: ReturnType<typeof neon>) {
  if (!schemaReady) schemaReady = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS hacktrack_records (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL,
      source_id text NOT NULL DEFAULT '',
      title text NOT NULL,
      organizer text NOT NULL DEFAULT '',
      url text NOT NULL DEFAULT '',
      deadline text NOT NULL DEFAULT '',
      prize text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved','registered','participating','submitted','awaiting_results','won','lost')),
      project_name text NOT NULL DEFAULT '',
      project_url text NOT NULL DEFAULT '',
      result_notes text NOT NULL DEFAULT '',
      prize_received text NOT NULL DEFAULT '',
      certificate_url text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS hacktrack_records_owner_source_idx ON hacktrack_records (owner_id, source_id) WHERE source_id <> ''`;
    await sql`CREATE INDEX IF NOT EXISTS hacktrack_records_owner_deadline_idx ON hacktrack_records (owner_id, deadline)`;
    await sql`CREATE TABLE IF NOT EXISTS hacktrack_activity (
      id uuid PRIMARY KEY,
      owner_id uuid NOT NULL,
      hackathon_id uuid NOT NULL,
      title text NOT NULL,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS hacktrack_activity_owner_created_idx ON hacktrack_activity (owner_id, created_at DESC)`;
  })().catch(error => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export function getOwnerId(request: NextRequest) {
  const existing = request.cookies.get(OWNER_COOKIE)?.value || '';
  return { ownerId: uuidPattern.test(existing) ? existing : crypto.randomUUID(), needsCookie: !uuidPattern.test(existing) };
}

export function withOwnerCookie(response: NextResponse, ownerId: string, needsCookie: boolean) {
  if (needsCookie) response.cookies.set(OWNER_COOKIE, ownerId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export function cleanText(value: unknown, maxLength = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function cleanUrl(value: unknown) {
  const candidate = cleanText(value, 2000);
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : '';
  } catch { return ''; }
}

export function isHackathonStatus(value: unknown): value is HackathonStatus {
  return typeof value === 'string' && validStatuses.has(value as HackathonStatus);
}

export async function loadTracker(sql: ReturnType<typeof neon>, ownerId: string): Promise<TrackerResponse> {
  const records = await sql`SELECT id::text AS id, source_id AS "sourceId", title, organizer, url, deadline, prize, status,
    project_name AS "projectName", project_url AS "projectUrl", result_notes AS "resultNotes", prize_received AS "prizeReceived",
    certificate_url AS "certificateUrl", created_at AS "createdAt", updated_at AS "updatedAt"
    FROM hacktrack_records WHERE owner_id = ${ownerId} ORDER BY created_at DESC LIMIT 300` as unknown as TrackedHackathon[];
  const activity = await sql`SELECT id::text AS id, hackathon_id::text AS "hackathonId", title, message, created_at AS "createdAt"
    FROM hacktrack_activity WHERE owner_id = ${ownerId} ORDER BY created_at DESC LIMIT 100` as unknown as TrackerActivity[];
  return { records, activity };
}

export async function appendActivity(sql: ReturnType<typeof neon>, ownerId: string, recordId: string, title: string, message: string) {
  await sql`INSERT INTO hacktrack_activity (id, owner_id, hackathon_id, title, message) VALUES (${crypto.randomUUID()}, ${ownerId}, ${recordId}, ${title}, ${message})`;
  await sql`DELETE FROM hacktrack_activity WHERE owner_id = ${ownerId} AND id NOT IN (
    SELECT id FROM hacktrack_activity WHERE owner_id = ${ownerId} ORDER BY created_at DESC LIMIT 100
  )`;
}

export function statusActivity(status: HackathonStatus) {
  return `Status changed to ${statusLabels[status]}`;
}
