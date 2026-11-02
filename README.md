# HackTrack Pro

A responsive Next.js dashboard that discovers hackathons directly from public event feeds. The default feeds need no login or credentials.

## Discovery sources and freshness

### Brabble.ai RSS (default, no key)

The app reads the documented public feed at `https://brabble.ai/rss/hackathons.xml`. I verified it returns HTTP 200 without credentials and publishes hackathons aggregated from multiple platforms, including Indian listings. The live response contained 100 items, so treat the no-key feed as a partial catalogue. Its feed description says it is refreshed daily; the RSS response advertises a one-hour HTTP cache. The app caches the RSS response for one hour and displays the feed's `lastBuildDate`.

RSS entries link to Brabble listing pages, which in turn direct applicants to organizers. The app labels those links “Open listing.” Reuse requires credit and a link to Brabble.ai; attribution is shown in the dashboard.

### Brabble listings API (optional, richer fields)

Set `BRABBLE_API_KEY` in `.env.local` to use Brabble's structured `/api/listings` endpoint instead of RSS. The current developer documentation requires authentication, and I verified that the live endpoint returns HTTP 401 without a key, despite a stale FAQ statement that says it is keyless. Create a free key in Brabble Developer settings. The key remains server-side. The API gives eligibility, team range, prize labels, and organizer URLs when available. Responses are cached for 60 minutes; Brabble says its underlying snapshot refreshes hourly and the data can change about once a day. Its reuse terms require attribution and say not to present the whole dataset as independently assembled. The app links to Brabble and sends registration traffic to organizer URLs when the API is enabled.

### Hackalendar (no key required)

The app also reads `https://hackalendar.com/api/events?limit=200`, a documented public API described by the provider as a human-verified catalogue. Responses are cached for 60 seconds. The API's `meta.generatedAt` and each event's `lastVerifiedAt` are surfaced in the dashboard. New events published to this catalogue appear automatically.

Hackalendar primarily covers Europe, with some online/global listings, so it is not a comprehensive global source. The browser checks for updates every 60 seconds and on tab focus, but upstream snapshots and server caches mean this is not real-time.

## Filters and limits

The dashboard includes solo-eligible, low-effort, cash-prize, and low/no-cash filters, plus **Rewards & Perks**, deadlines, and registration-information views. Rewards & Perks includes confirmed cash awards and source-stated swag, gifts, merchandise, gift cards, vouchers, discounts, scholarships, mentorship, starter kits, API/AI/cloud credits, free access, and refreshments that are clearly provided or included. A filter or badge appears only when source data provides evidence: solo eligibility needs explicit solo/individual language or a team range beginning at one; low effort needs explicit beginner/easy/few-hours/mini-challenge/no-code language; cash needs a numeric prize plus explicit cash wording. Unknown and in-kind rewards are included in the low/no-cash view. Confirm dates, rewards, and eligibility on the organizer's page.

The feeds do not provide a dedicated, complete rewards catalogue. Rewards & Perks only reflects benefits stated in the current Brabble and Hackalendar listings. Brabble's keyless RSS is capped at 100 listings; its richer structured API requires a server-side API key. Coverage is therefore partial and can miss events or benefits that providers do not publish in these feeds. The ScamShield page explains that the discovery sources do not provide plan data.

## My Hackathons tracker

The personal tracker lets visitors save an opportunity, update it through planning, registered, participating, project submitted, awaiting results, won, or did not win, and keep project links, result notes, prizes, and certificate links. It also shows progress counts, upcoming deadlines, and recent activity. RSS publication dates are kept separate from registration deadlines.

Tracker records are stored in the existing Neon Postgres database and scoped to the signed-in user's UUID. Google sign-in uses Better Auth with database-backed sessions. The profile stores the user's Google-verified name, email, and photo; the user can edit the display name and sign out. The private tracker page and its API validate the session on the server. On first sign-in in a browser that already has guest records, those records are transferred to the Google account; overlapping event entries are merged before ownership changes.

To enable production Google sign-in, set these server-side Vercel Production environment variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL=https://hacktrack-pro.vercel.app`. The Google OAuth Web client needs this authorized JavaScript origin: `https://hacktrack-pro.vercel.app`, and this exact authorized redirect URI: `https://hacktrack-pro.vercel.app/api/auth/callback/google`. Keep the client secret and Better Auth secret out of Git and chat. The Google sign-in requests only the basic OpenID, email, and profile scopes; it does not read Gmail. Gmail access, if added later, needs a separate consent flow and narrower purpose-specific review.

Better Auth's schema is migrated by the server before its auth endpoints are used. Neon remains on its Free plan; its limits can change and inactive compute may pause until used.

## Run locally

1. Install dependencies with `npm install`.
2. The default feeds work without configuration. Optionally set `BRABBLE_API_KEY` in `.env.local` for Brabble's structured API.
3. Run `npm run dev` and open the local URL printed by Next.js.
