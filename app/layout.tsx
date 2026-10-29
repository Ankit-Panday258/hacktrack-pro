import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'HackTrack Pro · Personal Hackathon Command Center', description: 'Discover and track hackathon opportunities from regularly refreshed public event feeds.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
