'use client';

import { useState } from 'react';
import { ArrowRight, Chrome, LoaderCircle } from 'lucide-react';
import { authClient } from '@/lib/auth-client';

export default function GoogleSignIn({ callbackURL }: { callbackURL: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL });
      if (result.error) setError(result.error.message || 'Google sign-in could not start. Please try again.');
    } catch {
      setError('Google sign-in could not start. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button className="google-sign-in-button" onClick={() => void signIn()} disabled={busy}>
      {busy ? <LoaderCircle size={18} className="auth-spinner"/> : <Chrome size={18}/>}<span>{busy ? 'Connecting to Google…' : 'Continue with Google'}</span><ArrowRight size={16}/>
    </button>
    {error && <p className="auth-form-error" role="alert">{error}</p>}
  </>;
}
