'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, Mail, RefreshCw, ScanSearch, ShieldCheck, Unplug, Upload } from 'lucide-react';
import { HackathonStatus, statusLabels, trackerStatuses } from '@/lib/my-hackathons';

type GmailCandidate = {
  id: string;
  title: string;
  subject: string;
  from: string;
  date: string;
  suggestedStatus: HackathonStatus;
};

type GmailConnection = {
  configured: boolean;
  connected: boolean;
  email: string;
  connectedAt: string;
};

type CandidatePage = {
  candidates: GmailCandidate[];
  nextPageToken: string | null;
  resultSizeEstimate: number;
};

type EditableCandidate = GmailCandidate & { selected: boolean; title: string; status: HackathonStatus };

export default function GmailImport({ onImported }: { onImported: () => Promise<void> }) {
  const [connection, setConnection] = useState<GmailConnection | null>(null);
  const [candidates, setCandidates] = useState<EditableCandidate[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [estimatedMatches, setEstimatedMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshConnection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/gmail/connection', { cache: 'no-store' });
      const result = await response.json() as GmailConnection & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not check Gmail connection.');
      setConnection(result);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check Gmail connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('gmail');
    if (result) {
      setNotice(result === 'connected'
        ? 'Gmail connected. Nothing has been imported yet; scan and review matches below.'
        : result === 'denied'
          ? 'Gmail access was not granted. Your tracker is unchanged.'
          : result === 'setup'
            ? 'Gmail OAuth setup is incomplete. Check the Google OAuth scope and callback setup.'
            : 'Gmail could not be connected. Please check the Google consent setup and try again.');
      params.delete('gmail');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
    void refreshConnection();
  }, [refreshConnection]);

  const selectedCount = candidates.filter(candidate => candidate.selected).length;

  async function scan(pageToken?: string | null) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/gmail/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageToken ? { pageToken } : {}),
      });
      const result = await response.json() as CandidatePage & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Gmail scan failed.');
      const incoming = (result.candidates || []).map(candidate => ({
        ...candidate,
        selected: false,
        title: candidate.title,
        status: candidate.suggestedStatus,
      }));
      setCandidates(current => pageToken ? [...current, ...incoming.filter(item => !current.some(old => old.id === item.id))] : incoming);
      setNextPageToken(result.nextPageToken || null);
      setEstimatedMatches(result.resultSizeEstimate || 0);
      setNotice(incoming.length
        ? `Found ${incoming.length} possible matches on this page. Select only the emails you want to add.`
        : 'No likely hackathon emails were found on this page.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gmail scan failed.');
    } finally {
      setBusy(false);
    }
  }

  function editCandidate(id: string, patch: Partial<EditableCandidate>) {
    setCandidates(current => current.map(candidate => candidate.id === id ? { ...candidate, ...patch } : candidate));
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Gmail? Saved hackathon records stay in your tracker.')) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/gmail/connection', { method: 'DELETE' });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not disconnect Gmail.');
      setConnection(current => current ? { ...current, connected: false, email: '', connectedAt: '' } : current);
      setCandidates([]);
      setNextPageToken(null);
      setNotice('Gmail disconnected. Imported tracker records were kept.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect Gmail.');
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    const selected = candidates.filter(candidate => candidate.selected);
    if (!selected.length) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/gmail/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: selected.map(({ id, title, status }) => ({ id, title, status })) }),
      });
      const result = await response.json() as { imported?: number; skipped?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not import selected matches.');
      setCandidates(current => current.filter(candidate => !candidate.selected));
      setNotice(`${result.imported || 0} record${result.imported === 1 ? '' : 's'} imported${result.skipped ? `; ${result.skipped} skipped as duplicates or unavailable` : ''}.`);
      await onImported();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import selected matches.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="my-tracker-panel gmail-import-panel" aria-labelledby="gmail-import-title">
    <div className="my-tracker-panel-heading"><div><span>OPTIONAL EMAIL IMPORT</span><h2 id="gmail-import-title">Find past hackathons in Gmail</h2></div><Mail size={18}/></div>
    <p className="gmail-import-copy">Gmail access is separate from sign-in. After you connect, scan likely event emails and review the matches before importing. Email text is processed for the scan and is not stored.</p>

    {notice && <div className="gmail-import-notice" role="status">{notice}</div>}
    {error && <div className="my-tracker-error gmail-import-error" role="alert">{error}</div>}

    <div className="gmail-import-controls">
      {loading
        ? <span className="gmail-import-muted"><LoaderCircle size={15} className="gmail-spinner"/> Checking Gmail connection…</span>
        : connection?.connected
          ? <><div className="gmail-connected"><span className="gmail-connected-icon"><ShieldCheck size={15}/></span><span><b>Connected mailbox</b><small>{connection.email}</small></span></div><button type="button" className="gmail-secondary-button" disabled={busy} onClick={() => void disconnect()}><Unplug size={14}/> Disconnect</button></>
          : <><a className="my-tracker-add-button gmail-connect-button" href="/api/gmail/connect"><Mail size={15}/> Connect Gmail</a><span className="gmail-import-muted">Google will ask separately for read-only email access.</span></>}
    </div>

    {connection?.connected && <div className="gmail-import-actions">
      <button type="button" className="gmail-secondary-button" disabled={busy} onClick={() => void scan(null)}><ScanSearch size={15}/>{busy ? 'Working…' : 'Scan for hackathon emails'}</button>
      {estimatedMatches > 0 && <span className="gmail-import-muted">About {estimatedMatches} possible messages in Gmail search</span>}
      {selectedCount > 0 && <button type="button" className="my-tracker-add-button gmail-import-submit" disabled={busy} onClick={() => void importSelected()}><Upload size={14}/> Import {selectedCount} selected</button>}
    </div>}

    {(candidates.length > 0 || nextPageToken) && <div className="gmail-candidate-list" aria-label="Gmail matches to review">
      {candidates.map(candidate => <article className="gmail-candidate" key={candidate.id}>
        <label className="gmail-candidate-check"><input type="checkbox" checked={candidate.selected} onChange={event => editCandidate(candidate.id, { selected: event.target.checked })}/><span className="sr-only">Select {candidate.title} for import</span></label>
        <div className="gmail-candidate-details">
          <label className="gmail-candidate-title">Hackathon name<input value={candidate.title} maxLength={240} onChange={event => editCandidate(candidate.id, { title: event.target.value })}/></label>
          <p><b>Email:</b> {candidate.subject || '(no subject)'}</p>
          <p><b>From:</b> {candidate.from || 'Unknown sender'}{candidate.date ? ` · ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(candidate.date))}` : ''}</p>
          <label className="gmail-candidate-status">Suggested progress<select value={candidate.status} onChange={event => editCandidate(candidate.id, { status: event.target.value as HackathonStatus })}>{trackerStatuses.map(status => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
        </div>
      </article>)}
      {nextPageToken && <button type="button" className="gmail-secondary-button gmail-more-button" disabled={busy} onClick={() => void scan(nextPageToken)}><RefreshCw size={14}/> Load more matches</button>}
      {candidates.length > 0 && <p className="gmail-import-muted"><Check size={13}/> Nothing is imported until you select matches and press Import.</p>}
    </div>}
  </section>;
}
