# HackTrack Pro

A responsive Next.js dashboard that reads Google Sheets on the server. The configured spreadsheet is **Hackathon Tracker — 10 Web & AI Opportunities — Oct 2026** (`(configured in the ignored local .env.local file)`). The spreadsheet ID is set locally in `.env.local`; that file is ignored by Git. No API key or service account credential is stored in source control or client code.

## Google Sheets access

The connected Google Drive account has read access to the sheet. The app server needs its own Google Sheets API credential:

- For a sheet readable by anyone with the link, provide a Google API key in `GOOGLE_SHEETS_API_KEY` (kept only in `.env.local`).
- For a private sheet, create a Google service account, share the sheet with its email as a Viewer, and set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` in `.env.local`. Store the private key with newlines escaped as `\\n`.

Copy `.env.example` only if you need a template; preserve the existing spreadsheet ID. Without one of the credentials above the site shows the connected-sheet credential message and a safe empty state.

## Data tabs and headers

The current spreadsheet contains `Hackathon Tracker`, `ScamShield AI Plan`, `Cash Prize Hackathons`, and `Physical Goodies`. The hackathon tabs use headers including `Hackathon`, `Official link`, `Mode`, `Deadline / dates (2026)`, `Solo eligibility`, `Fee`, `Prize / reward`, `Project / theme`, `Registration status`, `My status`, `Cash / entry summary`, and `Goodies / swag details`. The app maps values by header text and retains unknown columns as source fields.

The cash page requires numeric prize data explicitly described as cash in the prize value or a separate cash summary. Rows marked with in-kind/uncertain prizes and no explicit cash amount are omitted. Goodies are sourced from the dedicated goodies tab and physical-goods details in the tracker. ScamShield renders its sheet rows and values directly; absent fields are not filled with invented plan details.

The app refreshes the four tabs every 60 seconds and on browser focus, de-duplicates records by name within each tab, and shows its last sync time. Sheet data is untrusted content and is displayed as data only.

## Run locally

1. Install dependencies with `npm install`.
2. Set an API key or service account credentials in `.env.local` as described above.
3. Run `npm run dev` and open the local URL printed by Next.js.
