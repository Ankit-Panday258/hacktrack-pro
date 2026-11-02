'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Award, CalendarDays, ExternalLink, FileCheck2, FolderKanban, Plus, Sparkles, Target, Trophy, Trash2, type LucideIcon } from 'lucide-react';
import { HackathonStatus, statusLabels, TrackedHackathon, TrackerActivity, TrackerResponse, trackerStatuses } from '@/lib/my-hackathons';
import AuthMenu from '@/components/auth-menu';

const statusOrder: HackathonStatus[] = trackerStatuses;
type TrackerAction =
  | { action: 'add'; record: Partial<TrackedHackathon> & Pick<TrackedHackathon, 'title'> }
  | { action: 'update'; recordId: string; patch: Partial<TrackedHackathon>; message: string }
  | { action: 'delete'; recordId: string };
const safeLink = (value: string) => {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''; }
  catch { return ''; }
};
const formatDate = (value: string) => {
  if (!value) return 'Date not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

export default function MyHackathons() {
  const [records, setRecords] = useState<TrackedHackathon[]>([]);
  const [activity, setActivity] = useState<TrackerActivity[]>([]);
  const [ready, setReady] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | HackathonStatus>('all');
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [deadline, setDeadline] = useState('');
  const [eventUrl, setEventUrl] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/my-hackathons', { cache: 'no-store' });
      const result = await response.json() as TrackerResponse;
      if (!response.ok) throw new Error(result.error || 'Could not load your cloud tracker.');
      setRecords(result.records);
      setActivity(result.activity);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your cloud tracker.');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function sendAction(action: TrackerAction) {
    const response = await fetch('/api/my-hackathons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) });
    const result = await response.json() as TrackerResponse;
    if (!response.ok) throw new Error(result.error || 'Could not save your changes to the cloud.');
    await refresh();
  }

  const stats = useMemo(() => ({
    total: records.length,
    registered: records.filter(item => item.status === 'registered').length,
    participated: records.filter(item => item.status === 'participating' || item.status === 'submitted').length,
    submitted: records.filter(item => item.status === 'submitted').length,
    pending: records.filter(item => item.status === 'awaiting_results').length,
    won: records.filter(item => item.status === 'won').length,
    lost: records.filter(item => item.status === 'lost').length,
    rewards: records.filter(item => item.prizeReceived || item.certificateUrl).length,
  }), [records]);

  const upcoming = useMemo(() => records.filter(item => {
    const date = new Date(item.deadline);
    return item.deadline && !Number.isNaN(date.getTime()) && date.getTime() >= Date.now() && item.status !== 'won' && item.status !== 'lost';
  }).sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()).slice(0, 5), [records]);

  const filtered = filter === 'all' ? records : records.filter(item => item.status === filter);

  async function addManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      setError('');
      await sendAction({ action: 'add', record: { title, organizer, deadline, url: safeLink(eventUrl) } });
      setTitle(''); setOrganizer(''); setDeadline(''); setEventUrl(''); setShowAdd(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this hackathon.'); }
  }

  async function saveDetails(record: TrackedHackathon, patch: Partial<TrackedHackathon>) {
    try { setError(''); await sendAction({ action: 'update', recordId: record.id, patch, message: 'Updated project or reward details' }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save these details.'); }
  }

  async function changeStatus(record: TrackedHackathon, status: HackathonStatus) {
    try { setError(''); await sendAction({ action: 'update', recordId: record.id, patch: { status }, message: `Status changed to ${statusLabels[status]}` }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update this status.'); }
  }

  async function removeRecord(record: TrackedHackathon) {
    if (!window.confirm(`Remove “${record.title}” from your tracker?`)) return;
    try { setError(''); await sendAction({ action: 'delete', recordId: record.id }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not remove this record.'); }
  }

  return <div className="my-tracker-page">
    <header className="my-tracker-topbar">
      <Link href="/" className="my-tracker-brand"><span className="my-tracker-logo">H</span><span><b>HackTrack Pro</b><small>Personal Hackathon Command Center</small></span></Link>
      <nav aria-label="Main navigation"><Link href="/">Discover</Link><Link href="/my-hackathons" className="selected">My Hackathons</Link></nav><AuthMenu/>
    </header>
    <main className="my-tracker-main">
      <Link href="/" className="my-tracker-back"><ArrowLeft size={15}/> Back to discovery</Link>
      <section className="my-tracker-hero">
        <div><span className="my-tracker-eyebrow"><Sparkles size={14}/> YOUR HACKATHON JOURNEY</span><h1>My Hackathons</h1><p>Keep registrations, projects, results and rewards together.</p></div>
        <button className="my-tracker-add-button" onClick={() => setShowAdd(value => !value)}><Plus size={17}/>{showAdd ? 'Close form' : 'Add a hackathon'}</button>
      </section>

      <div className="my-tracker-local-note">Your tracker is saved to your Google account and is private to you.</div>
      {error && <div className="my-tracker-error" role="alert">{error}</div>}

      {showAdd && <form className="my-tracker-add-form" onSubmit={addManual}>
        <div className="my-tracker-form-heading"><div><b>Add a hackathon</b><small>Keep a record even if it is not in the discovery feed.</small></div></div>
        <label>Hackathon name<input required value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Campus Innovation Challenge"/></label>
        <label>Organizer<input value={organizer} onChange={event => setOrganizer(event.target.value)} placeholder="Optional"/></label>
        <label>Deadline<input type="date" value={deadline} onChange={event => setDeadline(event.target.value)}/></label>
        <label>Event link<input type="url" value={eventUrl} onChange={event => setEventUrl(event.target.value)} placeholder="https://…"/></label>
        <button type="submit" className="my-tracker-add-button"><Plus size={16}/> Add to tracker</button>
      </form>}

      <section className="my-tracker-stats" aria-label="Hackathon statistics">
        <TrackerStat icon={Target} label="Tracked" value={stats.total}/>
        <TrackerStat icon={CalendarDays} label="Registered" value={stats.registered}/>
        <TrackerStat icon={FolderKanban} label="Participated" value={stats.participated}/>
        <TrackerStat icon={FileCheck2} label="Pending results" value={stats.pending}/>
        <TrackerStat icon={Trophy} label="Won" value={stats.won}/>
        <TrackerStat icon={Award} label="Prizes / certificates" value={stats.rewards}/>
      </section>

      <div className="my-tracker-grid">
        <div className="my-tracker-main-column">
          <section className="my-tracker-panel">
            <div className="my-tracker-panel-heading"><div><span>YOUR PIPELINE</span><h2>Progress overview</h2></div><span className="my-tracker-total">{stats.total} total</span></div>
            <div className="my-tracker-chart">{statusOrder.map(status => {
              const count = records.filter(record => record.status === status).length;
              const width = stats.total ? `${Math.max(count ? 8 : 0, count / stats.total * 100)}%` : '0%';
              return <div className="my-tracker-chart-row" key={status}><span>{statusLabels[status]}</span><div className="my-tracker-bar-track"><i className={`status-${status}`} style={{ width }}/></div><b>{count}</b></div>;
            })}</div>
          </section>

          <section className="my-tracker-panel my-tracker-records-panel">
            <div className="my-tracker-panel-heading"><div><span>YOUR TRACKER</span><h2>Hackathon records</h2></div><select aria-label="Filter records by status" value={filter} onChange={event => setFilter(event.target.value as 'all' | HackathonStatus)}><option value="all">All statuses</option>{statusOrder.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></div>
            {!ready ? <p className="my-tracker-empty">Loading your cloud tracker…</p> : !filtered.length ? <div className="my-tracker-empty"><span>✦</span><b>{records.length ? 'No records in this status' : error ? 'Cloud storage is not ready yet' : 'Your tracker starts here'}</b><p>{error ? 'Connect the free database to Vercel to enable cloud saving.' : 'Add a hackathon here, or use “Track this” on an event in discovery.'}</p>{!error && <button onClick={() => setShowAdd(true)} className="my-tracker-inline-button"><Plus size={15}/> Add a hackathon</button>}</div> : <div className="my-tracker-record-list">{filtered.map(record => <RecordCard key={record.id} record={record} onStatus={status => changeStatus(record, status)} onSave={patch => saveDetails(record, patch)} onDelete={() => removeRecord(record)}/>)}</div>}
          </section>
        </div>

        <aside className="my-tracker-side-column">
          <section className="my-tracker-panel">
            <div className="my-tracker-panel-heading"><div><span>COMING UP</span><h2>Deadlines</h2></div><CalendarDays size={18}/></div>
            {upcoming.length ? <div className="my-tracker-deadlines">{upcoming.map(record => <div className="my-tracker-deadline" key={record.id}><span>{formatDate(record.deadline)}</span><b>{record.title}</b>{record.url && safeLink(record.url) && <a href={safeLink(record.url)} target="_blank" rel="noreferrer">Open event <ExternalLink size={12}/></a>}</div>)}</div> : <p className="my-tracker-muted">Future deadlines you add to a record will appear here.</p>}
          </section>
          <section className="my-tracker-panel">
            <div className="my-tracker-panel-heading"><div><span>RECENT CHANGES</span><h2>Activity</h2></div></div>
            {activity.length ? <div className="my-tracker-activity">{activity.slice(0, 8).map(item => <div className="my-tracker-activity-item" key={item.id}><i/><div><b>{item.message}</b><span>{item.title}</span><small>{formatDate(item.createdAt)}</small></div></div>)}</div> : <p className="my-tracker-muted">Your registrations, submissions and result updates will show here.</p>}
          </section>
          <section className="my-tracker-tip"><Trophy size={19}/><b>Record every milestone</b><p>Update a hackathon as you register, participate, submit a project and receive your results.</p></section>
        </aside>
      </div>
      <footer className="my-tracker-footer">Your hackathon records are stored in the cloud and scoped to your signed-in account.</footer>
    </main>
  </div>;
}

function TrackerStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return <article className="my-tracker-stat"><span><Icon size={17}/></span><b>{value}</b><small>{label}</small></article>;
}

function RecordCard({ record, onStatus, onSave, onDelete }: { record: TrackedHackathon; onStatus: (status: HackathonStatus) => Promise<void>; onSave: (patch: Partial<TrackedHackathon>) => Promise<void>; onDelete: () => void }) {
  const [projectName, setProjectName] = useState(record.projectName);
  const [projectUrl, setProjectUrl] = useState(record.projectUrl);
  const [resultNotes, setResultNotes] = useState(record.resultNotes);
  const [prizeReceived, setPrizeReceived] = useState(record.prizeReceived);
  const [certificateUrl, setCertificateUrl] = useState(record.certificateUrl);
  const [saving, setSaving] = useState(false);
  const eventLink = safeLink(record.url);
  const certLink = safeLink(record.certificateUrl);
  return <article className="my-tracker-record">
    <div className="my-tracker-record-top"><div><span className={`my-tracker-status status-${record.status}`}>{statusLabels[record.status]}</span><h3>{record.title}</h3><p>{record.organizer || 'Organizer not added'}{record.deadline ? ` · Deadline ${formatDate(record.deadline)}` : ''}</p></div><button className="my-tracker-delete" title={`Remove ${record.title}`} aria-label={`Remove ${record.title}`} onClick={onDelete}><Trash2 size={16}/></button></div>
    <div className="my-tracker-record-actions"><label>Progress<select value={record.status} onChange={event => void onStatus(event.target.value as HackathonStatus)}>{statusOrder.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>{eventLink && <a href={eventLink} target="_blank" rel="noreferrer">Event page <ExternalLink size={13}/></a>}{record.prize && <span className="my-tracker-prize"><Trophy size={14}/>{record.prize}</span>}</div>
    <details className="my-tracker-details"><summary>Project, result &amp; rewards</summary>
      <div className="my-tracker-detail-grid">
        <label>Project name<input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="Project submitted"/></label>
        <label>Project link<input type="url" value={projectUrl} onChange={event => setProjectUrl(event.target.value)} placeholder="https://…"/></label>
        <label>Prize received<input value={prizeReceived} onChange={event => setPrizeReceived(event.target.value)} placeholder="Prize, voucher, swag…"/></label>
        <label>Certificate link<input type="url" value={certificateUrl} onChange={event => setCertificateUrl(event.target.value)} placeholder="https://…"/></label>
        <label className="wide">Result notes<textarea value={resultNotes} onChange={event => setResultNotes(event.target.value)} placeholder="Team details, result, or a reminder" rows={3}/></label>
      </div>
      {(projectName || record.prizeReceived || certLink) && <div className="my-tracker-saved-summary">{projectName && <span><FolderKanban size={13}/>{projectName}</span>}{record.prizeReceived && <span><Trophy size={13}/>{record.prizeReceived}</span>}{certLink && <a href={certLink} target="_blank" rel="noreferrer"><Award size={13}/>Certificate <ExternalLink size={11}/></a>}</div>}
      <button className="my-tracker-save-button" disabled={saving} onClick={async () => { setSaving(true); try { await onSave({ projectName, projectUrl: safeLink(projectUrl), resultNotes, prizeReceived, certificateUrl: safeLink(certificateUrl) }); } finally { setSaving(false); } }}>{saving ? 'Saving…' : 'Save details'}</button>
    </details>
  </article>;
}
