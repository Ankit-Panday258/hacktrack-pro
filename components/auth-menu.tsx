'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LogOut, UserRound } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function AuthMenu() {
  const { data: session, isPending } = authClient.useSession();
  const [busy, setBusy] = useState(false);

  if (isPending) return <span className="auth-menu-loading" aria-label="Loading account"/>;
  if (!session) return <Link className="auth-sign-in-link" href="/sign-in?next=%2Fmy-hackathons">Sign in with Google</Link>;

  const initial = (session.user.name || session.user.email || 'U').trim().charAt(0).toUpperCase();

  async function signOut() {
    setBusy(true);
    try {
      await authClient.signOut();
      window.location.assign('/');
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-menu">
    <Link href="/profile" className="auth-profile-link" aria-label="Open your profile">
      <span className="auth-avatar">{initial || <UserRound size={15}/>}</span>
      <span className="auth-profile-name">{session.user.name || session.user.email}</span>
    </Link>
    <button className="auth-sign-out-button" onClick={() => void signOut()} disabled={busy} aria-label="Sign out">
      <LogOut size={15}/><span>{busy ? 'Signing out…' : 'Sign out'}</span>
    </button>
  </div>;
}
