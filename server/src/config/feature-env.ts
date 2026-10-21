import { env } from './env.js';

// Settings of the admin / donation features that develop's env.ts does not carry.

const positiveNumber = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
};

const isProduction = env.nodeEnv === 'production';

export const featureEnv = Object.freeze({
  // Swagger UI at /api/v1/docs. On by default outside production, never in production.
  docsEnabled:
    !isProduction &&
    (process.env.API_DOCS_ENABLED ? process.env.API_DOCS_ENABLED === 'true' : true),
  // Background jobs started by server.ts (never when NODE_ENV=test).
  jobs: {
    donationExpiry: {
      enabled: env.nodeEnv !== 'test' && process.env.DONATION_EXPIRY_JOB_ENABLED !== 'false',
      intervalMinutes: positiveNumber('DONATION_EXPIRY_JOB_INTERVAL_MINUTES', 5),
    },
  },
});
