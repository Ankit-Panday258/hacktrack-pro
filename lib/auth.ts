import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const authSecret = process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString('base64url');

export const isGoogleSignInConfigured = Boolean(googleClientId && googleClientSecret && process.env.BETTER_AUTH_SECRET && process.env.DATABASE_URL);

export const auth = betterAuth({
  database: pool,
  secret: authSecret,
  baseURL: process.env.BETTER_AUTH_URL || 'https://hacktrack-pro.vercel.app',
  socialProviders: isGoogleSignInConfigured ? {
    google: {
      clientId: googleClientId!,
      clientSecret: googleClientSecret!,
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
    },
  } : {},
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    database: { generateId: 'uuid', validateSchema: false },
  },
  plugins: [nextCookies()],
});
