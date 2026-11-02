import { NextResponse } from 'next/server';
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';
import { ensureAuthSchema } from '@/lib/server/auth-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = toNextJsHandler(auth);

async function runAuthHandler(handler: (request: Request) => Promise<Response>, request: Request) {
  try {
    await ensureAuthSchema();
    return await handler(request);
  } catch {
    return NextResponse.json({ message: 'Authentication is temporarily unavailable.' }, { status: 503 });
  }
}

export const GET = (request: Request) => runAuthHandler(handlers.GET, request);
export const POST = (request: Request) => runAuthHandler(handlers.POST, request);
