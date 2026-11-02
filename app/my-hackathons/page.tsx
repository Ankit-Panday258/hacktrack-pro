import MyHackathons from '@/components/my-hackathons';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthSession } from '@/lib/server/auth-session';

export const dynamic = 'force-dynamic';

export default async function MyHackathonsPage() {
  const session = await getAuthSession(await headers());
  if (!session) redirect('/sign-in?next=%2Fmy-hackathons');
  return <MyHackathons/>;
}
