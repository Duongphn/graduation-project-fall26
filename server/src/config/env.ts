import 'dotenv/config';

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
};

const optional = (value: string | undefined): string | undefined =>
  value && value.trim() ? value.trim() : undefined;

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

// The x-dev-user-id header (shared/middleware/auth-placeholder.ts) is accepted only when
// ALLOW_DEV_AUTH=true AND NODE_ENV is set explicitly to development or test (an allowlist: an
// unset, staging or production NODE_ENV refuses to start with the flag on).
const DEV_AUTH_ENVIRONMENTS = new Set(['development', 'test']);
const allowDevAuth = process.env.ALLOW_DEV_AUTH === 'true';
if (allowDevAuth && !DEV_AUTH_ENVIRONMENTS.has(process.env.NODE_ENV ?? '')) {
  throw new Error(
    'ALLOW_DEV_AUTH must only be enabled when NODE_ENV is explicitly development or test.',
  );
}

export const env = Object.freeze({
  nodeEnv,
  port: parsePort(process.env.PORT),
  mongoDbUri: process.env.MONGODB_URI ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  allowDevAuth,
  // Swagger UI at /api/docs. On by default outside production, never in production.
  docsEnabled:
    !isProduction &&
    (process.env.API_DOCS_ENABLED ? process.env.API_DOCS_ENABLED === 'true' : true),
  cloudinary: {
    cloudName: optional(process.env.CLOUDINARY_CLOUD_NAME),
    apiKey: optional(process.env.CLOUDINARY_API_KEY),
    apiSecret: optional(process.env.CLOUDINARY_API_SECRET),
  },
});
