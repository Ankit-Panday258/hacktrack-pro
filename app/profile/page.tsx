import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ProfileSettings from '@/components/profile-settings';
import AuthMenu from '@/components/auth-menu';
import { getAuthSession } from '@/lib/server/auth-session';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await getAuthSession(await headers());
  if (!session) redirect('/sign-in?next=%2Fprofile');

  return <div className="my-tracker-page">
    <header className="my-tracker-topbar">
      <Link href="/" className="my-tracker-brand"><span className="my-tracker-logo">H</span><span><b>HackTrack Pro</b><small>Personal Hackathon Command Center</small></span></Link>
      <nav aria-label="Main navigation"><Link href="/">Discover</Link><Link href="/my-hackathons">My Hackathons</Link></nav>
      <AuthMenu/>
    </header>
    <main className="profile-main">
      <Link href="/my-hackathons" className="my-tracker-back"><ArrowLeft size={15}/> Back to My Hackathons</Link>
      <ProfileSettings user={{ name: session.user.name, email: session.user.email }}/>
    </main>
  </div>;
}
