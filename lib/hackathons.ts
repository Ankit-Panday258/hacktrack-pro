export type Hackathon = Record<string, string> & { _id: string; _source: string };
type HackalendarEvent = {
  id: string; name: string; description?: string | null; url?: string | null; registrationUrl?: string | null;
  startAt?: string | null; endAt?: string | null; registrationDeadline?: string | null; mode?: string | null;
  venue?: string | null; cityLabel?: string | null; countryCode?: string | null; themes?: string[];
  prizePool?: string | null; isFree?: boolean | null; organizer?: string | null; lastVerifiedAt?: string | null;
};
type BrabbleListing = {
  id: string; title: string; organiser?: string; type?: string; kind?: string; platform?: string; url?: string;
  shareUrl?: string; deadline?: string; mode?: string; city?: string; prize?: { label?: string; inr?: number | null };
  team?: string; fee?: string; eligibility?: string[]; registered?: number | null;
};
type SourceStatus = { status: 'available' | 'unavailable' | 'not_configured'; refreshedAt: string | null; origin?: string; count: number; error: string | null; attribution?: string };

const toRow = (value: Record<string, unknown>, id: string, source: string): Hackathon => ({
  ...Object.fromEntries(Object.entries(value).map(([key, field]) => [key, Array.isArray(field) ? field.join(', ') : field == null ? '' : String(field)])),
  _id: `${source.toLowerCase()}:${id}`,
  _source: source,
});
const eventName = (row: Hackathon) => (row.name || row.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function getHackalendar() {
  try {
    const response = await fetch('https://hackalendar.com/api/events?limit=200', { next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`Hackalendar returned ${response.status}.`);
    const body = await response.json() as { data?: HackalendarEvent[]; meta?: { generatedAt?: string; hasMore?: boolean; nextOffset?: number | null } };
    const events = [...(body.data ?? [])];
    let nextOffset = body.meta?.nextOffset ?? undefined;
    let hasMore = body.meta?.hasMore ?? false;
    for (let page = 0; hasMore && nextOffset !== undefined && page < 9; page++) {
      const pageUrl = new URL('https://hackalendar.com/api/events'); pageUrl.searchParams.set('limit', '200'); pageUrl.searchParams.set('offset', String(nextOffset));
      const pageResponse = await fetch(pageUrl, { next: { revalidate: 60 } });
      if (!pageResponse.ok) throw new Error(`Hackalendar returned ${pageResponse.status} while paging.`);
      const next = await pageResponse.json() as typeof body;
      events.push(...(next.data ?? [])); nextOffset = next.meta?.nextOffset ?? undefined; hasMore = next.meta?.hasMore ?? false;
    }
    const rows = events.filter(event => event.id && event.name).map(event => toRow({
      name: event.name, description: event.description, url: event.url, registrationUrl: event.registrationUrl,
      startAt: event.startAt, endAt: event.endAt, registrationDeadline: event.registrationDeadline, mode: event.mode,
      venue: event.venue, cityLabel: event.cityLabel, countryCode: event.countryCode, themes: event.themes,
      prizePool: event.prizePool, isFree: event.isFree, organiser: event.organizer, lastVerifiedAt: event.lastVerifiedAt,
    }, event.id, 'Hackalendar'));
    return { rows, status: { status: 'available' as const, refreshedAt: body.meta?.generatedAt ?? null, count: rows.length, error: null } };
  } catch (error) {
    return { rows: [] as Hackathon[], status: { status: 'unavailable' as const, refreshedAt: null, count: 0, error: error instanceof Error ? error.message : 'Could not read Hackalendar.' } };
  }
}

async function getBrabble(): Promise<{ rows: Hackathon[]; status: SourceStatus }> {
  const key = process.env.BRABBLE_API_KEY;
  if (!key) {
    try {
      const response = await fetch('https://brabble.ai/rss/hackathons.xml', { next: { revalidate: 3600 } });
      if (!response.ok) throw new Error(`Brabble RSS returned ${response.status}.`);
      const xml = await response.text();
      const unescapeXml = (text: string) => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
      const tag = (item: string, name: string) => unescapeXml(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '');
      const items = (xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? []).map(item => item.replace(/^<item\b[^>]*>/i, '').replace(/<\/item>$/i, ''));
      const rows = items.flatMap(item => {
        const title = tag(item, 'title'); const url = tag(item, 'link'); const description = tag(item, 'description'); const id = tag(item, 'guid') || url;
        if (!title || !id) return [];
        const prize = description.match(/Prize:\s*(.*?)(?:\s+-\s+(?:In person|Online)|\s+·|$)/i)?.[1]?.trim() ?? '';
        const organizer = description.split(/\s+·\s+via\s+/i)[0] ?? '';
        const platform = description.match(/\bvia\s+([^·]+)/i)?.[1]?.trim() ?? '';
        const venue = description.match(/In person:\s*([^·]+)/i)?.[1]?.trim() ?? '';
        return [toRow({ title, description, shareUrl: url, url, deadline: tag(item, 'pubDate'), organiser: organizer, platform, prizeLabel: prize, mode: /online/i.test(description) ? 'ONLINE' : venue ? 'OFFLINE' : '', city: venue }, id, 'Brabble RSS')];
      });
      const refreshedAt = unescapeXml(xml.match(/<lastBuildDate>([\s\S]*?)<\/lastBuildDate>/i)?.[1] ?? '') || null;
      return { rows, status: { status: 'available', refreshedAt, origin: 'RSS', count: rows.length, error: null, attribution: 'Listings from Brabble.ai; reuse requires credit and a link.' } };
    } catch (error) {
      return { rows: [], status: { status: 'unavailable', refreshedAt: null, count: 0, error: error instanceof Error ? error.message : 'Could not read Brabble RSS.' } };
    }
  }
  try {
    const fetchPage = async (offset: number) => {
      const url = new URL('https://brabble.ai/api/listings');
      url.searchParams.set('hub', 'hackathons'); url.searchParams.set('limit', '200'); url.searchParams.set('offset', String(offset));
      const response = await fetch(url, { headers: { 'x-api-key': key }, next: { revalidate: 3600 } });
      if (!response.ok) throw new Error(`Brabble returned ${response.status}.`);
      return response.json() as Promise<{ refreshedAt?: string; origin?: string; total?: number; listings?: BrabbleListing[]; attribution?: string }>;
    };
    const first = await fetchPage(0);
    const total = Math.min(first.total ?? first.listings?.length ?? 0, 10000);
    const offsets = Array.from({ length: Math.ceil(Math.max(0, total - 200) / 200) }, (_, i) => (i + 1) * 200);
    const remaining = await Promise.all(offsets.map(fetchPage));
    const listings = [...(first.listings ?? []), ...remaining.flatMap(page => page.listings ?? [])];
    const rows = listings.filter(listing => listing.id && listing.title).map(listing => toRow({
      title: listing.title, organiser: listing.organiser, type: listing.type, kind: listing.kind, platform: listing.platform,
      url: listing.url, registrationUrl: listing.url, shareUrl: listing.shareUrl, deadline: listing.deadline, mode: listing.mode, city: listing.city,
      prizeLabel: listing.prize?.label, prizeINR: listing.prize?.inr, team: listing.team, fee: listing.fee,
      eligibility: listing.eligibility, registered: listing.registered,
    }, listing.id, 'Brabble'));
    return { rows, status: { status: 'available', refreshedAt: first.refreshedAt ?? null, origin: first.origin, count: rows.length, error: null, attribution: first.attribution } };
  } catch (error) {
    return { rows: [], status: { status: 'unavailable', refreshedAt: null, count: 0, error: error instanceof Error ? error.message : 'Could not read Brabble.' } };
  }
}

export async function getHackathonData() {
  const [hackalendar, brabble] = await Promise.all([getHackalendar(), getBrabble()]);
  const seen = new Set<string>();
  const rows = [...brabble.rows, ...hackalendar.rows].filter(row => {
    const key = eventName(row) || row._id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    syncedAt: new Date().toISOString(),
    tabs: { Hackathons: rows },
    sources: { hackalendar: hackalendar.status, brabble: brabble.status },
    error: rows.length ? null : [hackalendar.status.error, brabble.status.error].filter(Boolean).join(' ') || null,
  };
}
