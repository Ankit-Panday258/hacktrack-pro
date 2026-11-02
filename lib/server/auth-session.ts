import { getMigrations } from 'better-auth/db/migration';
import { auth } from '@/lib/auth';

let schemaReady: Promise<void> | undefined;

export async function ensureAuthSchema() {
  if (!process.env.DATABASE_URL) throw new Error('Cloud database is not configured.');
  if (!process.env.BETTER_AUTH_SECRET) throw new Error('Authentication secret is not configured.');

  if (!schemaReady) {
    schemaReady = (async () => {
      const { runMigrations } = await getMigrations(auth.options);
      await runMigrations();
    })().catch(error => {
      schemaReady = undefined;
      throw error;
    });
  }

  await schemaReady;
}

export async function getAuthSession(requestHeaders: Headers) {
  await ensureAuthSchema();
  return auth.api.getSession({ headers: requestHeaders });
}
