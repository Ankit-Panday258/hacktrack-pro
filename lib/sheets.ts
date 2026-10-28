import { GoogleAuth } from 'google-auth-library';

export type Hackathon = Record<string, string> & { _id: string; _source: string };
const TABS = ['Hackathon Tracker', 'Cash Prize Hackathons', 'Physical Goodies', 'ScamShield AI Plan'] as const;
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const cleanRow = (headers: string[], values: string[], tab: string): Hackathon | null => {
  const row: Record<string, string> = {};
  headers.forEach((h, i) => { const value = (values[i] ?? '').trim(); if (h?.trim() && value) row[h.trim()] = value; });
  if (!Object.keys(row).length) return null;
  const id = Object.entries(row).find(([k]) => /^(id|name|hackathon|eventname|title)$/i.test(normalize(k)))?.[1] ?? '';
  return { ...row, _id: normalize(id || Object.values(row).join('|')), _source: tab };
};

export async function getSheetData() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) return { configured: false, syncedAt: null, tabs: {}, error: null };
  let token: string | undefined;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) {
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!email || !key) return { configured: false, syncedAt: null, tabs: {}, error: 'Add an API key for a public sheet or service account credentials for a private sheet.' };
    const auth = new GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
    token = await auth.getAccessToken() ?? undefined;
  }
  const headers = new Headers(); if (token) headers.set('Authorization', `Bearer ${token}`);
  const entries = await Promise.all(TABS.map(async tab => {
    const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!A:ZZ`);
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${range}`);
    if (apiKey) url.searchParams.set('key', apiKey);
    const response = await fetch(url, { headers, next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status} for “${tab}”.`);
    const body = await response.json() as { values?: string[][] };
    const [head = [], ...rows] = body.values ?? [];
    return [tab, rows.map(row => cleanRow(head, row, tab)).filter((row): row is Hackathon => Boolean(row))] as const;
  }));
  const tabs: Record<string, Hackathon[]> = Object.fromEntries(entries);
  for (const tab of TABS) {
    const seen = new Set<string>();
    tabs[tab] = tabs[tab].filter(row => { const key = row._id; if (seen.has(key)) return false; seen.add(key); return true; });
  }
  return { configured: true, syncedAt: new Date().toISOString(), tabs, error: null };
}
