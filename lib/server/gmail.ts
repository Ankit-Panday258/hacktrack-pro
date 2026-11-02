import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { HackathonStatus } from '@/lib/my-hackathons';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_OAUTH_COOKIE = 'hacktrack_gmail_oauth';
export const GMAIL_SEARCH_QUERY = '{hackathon hackathons devpost devfolio unstop hack2skill hackerearth hackclub}';

type OAuthCookiePayload = {
  state: string;
  verifier: string;
  ownerId: string;
  expiresAt: number;
};

type GmailConnectionRow = {
  ownerId: string;
  email: string;
  refreshTokenCiphertext: string;
  scopes: string;
  connectedAt: string;
};

export type GmailCandidate = {
  id: string;
  title: string;
  subject: string;
  from: string;
  date: string;
  suggestedStatus: HackathonStatus;
};

export class GmailIntegrationError extends Error {}

export function isGmailConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.BETTER_AUTH_SECRET);
}

export function getGmailRedirectUri(origin: string) {
  const configuredBase = process.env.BETTER_AUTH_URL || origin;
  const base = new URL(configuredBase);
  if (process.env.NODE_ENV === 'production' && base.protocol !== 'https:') {
    throw new GmailIntegrationError('Gmail connection requires an HTTPS application URL.');
  }
  return new URL('/api/gmail/callback', base).toString();
}

function getEncryptionKey(purpose: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new GmailIntegrationError('Secure Gmail storage is not configured.');
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret), Buffer.from('hacktrack-pro'), Buffer.from(purpose), 32));
}

function encrypt(value: string, purpose: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(purpose), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decrypt(value: string, purpose: string) {
  const [ivText, tagText, ciphertextText, extra] = value.split('.');
  if (!ivText || !tagText || !ciphertextText || extra !== undefined) throw new GmailIntegrationError('Encrypted Gmail data is invalid.');
  const iv = Buffer.from(ivText, 'base64url');
  const tag = Buffer.from(tagText, 'base64url');
  const ciphertext = Buffer.from(ciphertextText, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > 8192) throw new GmailIntegrationError('Encrypted Gmail data is invalid.');
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function sealOAuthCookie(payload: OAuthCookiePayload) {
  return encrypt(JSON.stringify(payload), 'gmail-oauth-state-v1');
}

export function openOAuthCookie(value: string): OAuthCookiePayload | null {
  try {
    const parsed = JSON.parse(decrypt(value, 'gmail-oauth-state-v1')) as Partial<OAuthCookiePayload>;
    if (typeof parsed.state !== 'string' || typeof parsed.verifier !== 'string' || typeof parsed.ownerId !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt < Date.now()) return null;
    return parsed as OAuthCookiePayload;
  } catch {
    return null;
  }
}

export function createOAuthRequest() {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, state, challenge };
}

export function stateMatches(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function ensureGmailSchema(sql: ReturnType<typeof neon>) {
  await sql`CREATE TABLE IF NOT EXISTS hacktrack_gmail_connections (
    owner_id uuid PRIMARY KEY,
    email text NOT NULL,
    refresh_token_ciphertext text NOT NULL,
    scopes text NOT NULL,
    connected_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
}

export async function getGmailConnection(sql: ReturnType<typeof neon>, ownerId: string) {
  const rows = await sql`SELECT owner_id AS "ownerId", email, refresh_token_ciphertext AS "refreshTokenCiphertext", scopes,
    connected_at AS "connectedAt" FROM hacktrack_gmail_connections WHERE owner_id = ${ownerId} LIMIT 1` as unknown as GmailConnectionRow[];
  return rows[0] || null;
}

export async function saveGmailConnection(sql: ReturnType<typeof neon>, ownerId: string, email: string, refreshToken: string, scopes: string) {
  const encrypted = encrypt(refreshToken, 'gmail-refresh-token-v1');
  await sql`INSERT INTO hacktrack_gmail_connections (owner_id, email, refresh_token_ciphertext, scopes)
    VALUES (${ownerId}, ${email}, ${encrypted}, ${scopes})
    ON CONFLICT (owner_id) DO UPDATE SET email = EXCLUDED.email, refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
      scopes = EXCLUDED.scopes, connected_at = now(), updated_at = now()`;
}

export async function removeGmailConnection(sql: ReturnType<typeof neon>, ownerId: string) {
  const rows = await sql`DELETE FROM hacktrack_gmail_connections WHERE owner_id = ${ownerId}
    RETURNING refresh_token_ciphertext AS "refreshTokenCiphertext"` as unknown as Array<{ refreshTokenCiphertext: string }>;
  return rows[0]?.refreshTokenCiphertext ? decrypt(rows[0].refreshTokenCiphertext, 'gmail-refresh-token-v1') : null;
}

export async function getGmailAccessToken(connection: GmailConnectionRow) {
  const refreshToken = decrypt(connection.refreshTokenCiphertext, 'gmail-refresh-token-v1');
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const tokens = await response.json().catch(() => null) as { access_token?: string; refresh_token?: string } | null;
  if (!response.ok || !tokens?.access_token) {
    throw new GmailIntegrationError('Gmail access expired or was revoked. Disconnect and connect Gmail again.');
  }
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || null };
}

export async function updateRefreshTokenIfRotated(sql: ReturnType<typeof neon>, ownerId: string, refreshToken: string | null) {
  if (!refreshToken) return;
  const encrypted = encrypt(refreshToken, 'gmail-refresh-token-v1');
  await sql`UPDATE hacktrack_gmail_connections SET refresh_token_ciphertext = ${encrypted}, updated_at = now() WHERE owner_id = ${ownerId}`;
}

export async function gmailProfileEmail(accessToken: string) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const profile = await response.json().catch(() => null) as { emailAddress?: string } | null;
  if (!response.ok || !profile?.emailAddress) throw new GmailIntegrationError('Google did not grant Gmail read access. Check the consent and OAuth setup.');
  return profile.emailAddress;
}

type GmailMessageList = { messages?: Array<{ id?: string }>; nextPageToken?: string; resultSizeEstimate?: number };
type GmailMessage = {
  id?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { mimeType?: string; headers?: Array<{ name?: string; value?: string }>; body?: { data?: string }; parts?: GmailMessage['payload'][] };
};

function safeHeader(value: string | undefined, max = 500) {
  return (value || '').replace(/[\r\n\0]/g, ' ').trim().slice(0, max);
}

function getHeader(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(header => header.name?.toLowerCase() === name.toLowerCase())?.value || '';
}

function collectText(payload: GmailMessage['payload'] | undefined, plain: string[], html: string[]) {
  if (!payload) return;
  const data = payload.body?.data;
  if (data) {
    const decoded = Buffer.from(data, 'base64url').toString('utf8');
    if (payload.mimeType === 'text/plain') plain.push(decoded);
    else if (payload.mimeType === 'text/html') html.push(decoded);
  }
  payload.parts?.forEach(part => collectText(part, plain, html));
}

function inferStatus(text: string): HackathonStatus {
  if (/\b(you won|winner|congratulations.{0,80}(?:won|winner)|awarded|first place|1st place|prize winner)\b/i.test(text)) return 'won';
  if (/\b(not selected|not advance|did not win|didn't win|unsuccessful|regret to inform|did not qualify)\b/i.test(text)) return 'lost';
  if (/\b(submission (?:was )?(?:received|confirmed)|submitted successfully|project submission|awaiting results)\b/i.test(text)) return 'awaiting_results';
  if (/\b(registered successfully|registration (?:is )?confirmed|thank you for registering)\b/i.test(text)) return 'registered';
  if (/\b(participated|participation certificate|attendance verified|checked in|check-in)\b/i.test(text)) return 'participating';
  return 'saved';
}

function titleFromSubject(subject: string) {
  let title = subject.replace(/^(?:re|fwd|fw):\s*/i, '').trim();
  title = title.replace(/^(?:you(?:'re| are) registered for|registration (?:confirmed|confirmation) for|submission (?:received|confirmed) for|project submitted to|results? for|thank you for (?:registering for|participating in)|congratulations(?:,? you (?:won|are a winner of))?\s*(?:for|in)?)\s*/i, '').trim();
  title = title.replace(/\s+(?:registration confirmed|submission (?:received|confirmed)|has been received|was received|results? announced|winner announcement).*$/i, '').trim();
  return safeHeader(title || subject, 240) || 'Hackathon from Gmail';
}

export async function getGmailMessage(accessToken: string, id: string): Promise<GmailCandidate | null> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const message = await response.json().catch(() => null) as GmailMessage | null;
  if (!message?.id) return null;

  const subject = safeHeader(getHeader(message, 'subject'));
  const from = safeHeader(getHeader(message, 'from'));
  const plain: string[] = [];
  const html: string[] = [];
  collectText(message.payload, plain, html);
  const bodyText = (plain.join(' ') || html.join(' ').replace(/<[^>]*>/g, ' ')).slice(0, 15000);
  const searchable = `${subject} ${from} ${message.snippet || ''} ${bodyText}`.slice(0, 20000);
  if (!/\b(hackathon|hackathons|devpost|devfolio|unstop|hack2skill|hackerearth|hackclub)\b/i.test(searchable)) return null;

  const dateHeader = getHeader(message, 'date');
  const timestamp = Number(message.internalDate);
  const parsedDate = dateHeader ? new Date(dateHeader) : new Date(timestamp);
  const date = Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toISOString();
  return {
    id: message.id,
    title: titleFromSubject(subject),
    subject: safeHeader(subject, 240),
    from,
    date,
    suggestedStatus: inferStatus(searchable),
  };
}

export async function scanGmail(accessToken: string, pageToken?: string | null) {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', GMAIL_SEARCH_QUERY);
  url.searchParams.set('maxResults', '30');
  if (pageToken) url.searchParams.set('pageToken', pageToken.slice(0, 2048));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
  const list = await response.json().catch(() => null) as GmailMessageList | null;
  if (!response.ok || !list) throw new GmailIntegrationError('Gmail search failed. Check the Gmail permission and try again.');
  const ids = (list.messages || []).map(item => item.id).filter((id): id is string => Boolean(id));
  const candidates: GmailCandidate[] = [];
  for (let start = 0; start < ids.length; start += 5) {
    const messages = await Promise.all(ids.slice(start, start + 5).map(id => getGmailMessage(accessToken, id).catch(() => null)));
    candidates.push(...messages.filter((item): item is GmailCandidate => Boolean(item)));
  }
  return { candidates, nextPageToken: list.nextPageToken || null, resultSizeEstimate: list.resultSizeEstimate || 0 };
}

export function gmailTitleSourceId(title: string, from: string, messageId: string) {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedFrom = from.toLowerCase().match(/@([^>\s]+)/)?.[1] || '';
  const fingerprint = normalizedTitle ? `${normalizedTitle}|${normalizedFrom}` : messageId;
  return `gmail:${createHash('sha256').update(fingerprint).digest('hex').slice(0, 40)}`;
}
