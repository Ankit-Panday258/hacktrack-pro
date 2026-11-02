'use client';

import { FormEvent, useState } from 'react';
import { BadgeCheck, Save } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function ProfileSettings({ user }: { user: { name: string; email: string } }) {
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await authClient.updateUser({ name: cleanName });
      if (result.error) throw new Error(result.error.message || 'Could not update your profile.');
      setMessage('Profile updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your profile.');
    } finally {
      setBusy(false);
    }
  }

  const initial = (name || user.email || 'U').trim().charAt(0).toUpperCase();

  return <section className="profile-card">
    <div className="profile-card-heading"><span className="profile-avatar">{initial}</span><div><span className="my-tracker-eyebrow"><BadgeCheck size={14}/> GOOGLE PROFILE</span><h1>Your profile</h1><p>Manage the name shown in your HackTrack Pro account.</p></div></div>
    <form className="profile-form" onSubmit={saveProfile}>
      <label>Display name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} required/></label>
      <label>Google email<input value={user.email} readOnly aria-readonly="true"/></label>
      <p className="profile-email-note">Your email is verified by Google and cannot be changed here.</p>
      {message && <p className="auth-form-success" role="status">{message}</p>}
      {error && <p className="auth-form-error" role="alert">{error}</p>}
      <button className="profile-save-button" type="submit" disabled={busy || !name.trim()}><Save size={16}/>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>
  </section>;
}
