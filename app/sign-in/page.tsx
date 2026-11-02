import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Trophy } from 'lucide-react';
import GoogleSignIn from '@/components/google-sign-in';
import { isGoogleSignInConfigured } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function safeCallback(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.startsWith('/') && !candidate.startsWith('//') && !candidate.startsWith('/\\')
    ? candidate
    : '/my-hackathons';
}

export default async function SignInPage({ searchParams }: { searchParams?: { next?: string | string[]; error?: string } }) {
  const callbackURL = safeCallback(searchParams?.next);

  return <main className="auth-page">
    <section className="auth-card">
      <Link href="/" className="auth-back-link"><ArrowLeft size={15}/> Back to HackTrack Pro</Link>
      <div className="auth-card-icon"><Trophy size={22}/></div>
      <span className="my-tracker-eyebrow"><ShieldCheck size={14}/> PRIVATE HACKATHON TRACKER</span>
      <h1>Sign in to HackTrack Pro</h1>
      <p className="auth-card-description">Save your registrations, projects, results and prizes to your personal cloud profile.</p>
      {searchParams?.error && <p className="auth-form-error" role="alert">Google sign-in did not finish. Please try again.</p>}
      {isGoogleSignInConfigured
        ? <GoogleSignIn callbackURL={callbackURL}/>
        : <div className="auth-setup-note">Google sign-in still needs its OAuth client configured in Vercel Production.</div>}
      <p className="auth-privacy-note">Sign-in requests only your Google name, email address and profile photo. It does not read Gmail.</p>
    </section>
  </main>;
}
