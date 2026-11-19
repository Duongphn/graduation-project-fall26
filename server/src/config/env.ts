import 'dotenv/config';

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
};

/**
 * JWT secrets have no fallback: a fixed default would let anyone sign tokens (even Admin ones).
 * Read lazily so scripts that never touch JWT (seed/backfill jobs) still run; the server calls
 * assertRequiredSecrets() at start-up so a missing secret stops it before it listens.
 */
const JWT_SECRET_NAMES = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const;
type JwtSecretName = (typeof JWT_SECRET_NAMES)[number];

const requireSecret = (name: JwtSecretName): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Add a long random value for it to server/.env before starting the server.`);
  }
  return value;
};

/** Throws an error naming the first missing JWT secret */
export const assertRequiredSecrets = (): void => {
  for (const name of JWT_SECRET_NAMES) requireSecret(name);
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
  mongoDbUri: process.env.MONGODB_URI ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  // Number of proxies in front of the API (1 on Render), so req.ip is the client's address.
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  // Limit of each /auth action per client IP per minute (R5.4 TC-SEC-032); 0 turns it off.
  authRateLimitPerMinute: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? (process.env.NODE_ENV === 'test' ? 0 : 10)),

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',

  // Email SMTP
  emailHost: process.env.EMAIL_HOST ?? 'smtp.gmail.com',
  emailPort: Number(process.env.EMAIL_PORT ?? 587),
  emailUser: process.env.EMAIL_USER ?? '',
  emailAppPassword: process.env.EMAIL_APP_PASSWORD ?? '',

  // JWT (R04 III.1.1: access token 1 hour, refresh token 30 days)
  get jwtAccessSecret(): string {
    return requireSecret('JWT_ACCESS_SECRET');
  },
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '1h',
  get jwtRefreshSecret(): string {
    return requireSecret('JWT_REFRESH_SECRET');
  },
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? '',

  // Rental Scheduler
  rentalSchedulerEnabled: process.env.RENTAL_SCHEDULER_ENABLED === 'true',

  // VNPay sandbox (UC17 top-up). Empty TMN code / hash secret: POST /payments/topup/vnpay returns 503.
  vnpayTmnCode: process.env.VNPAY_TMN_CODE?.trim() ?? '',
  vnpayHashSecret: process.env.VNPAY_HASH_SECRET?.trim() ?? '',
  vnpayUrl: process.env.VNPAY_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  // The frontend page VNPay sends the browser back to; it forwards the query to GET /payments/vnpay-return
  vnpayReturnUrl: process.env.VNPAY_RETURN_URL ?? 'http://localhost:5173/wallet/topup/result',

  // PayOS (UC17 top-up by bank transfer QR, real money). Empty keys: POST /payments/topup/payos returns 503.
  payosClientId: process.env.PAYOS_CLIENT_ID?.trim() ?? '',
  payosApiKey: process.env.PAYOS_API_KEY?.trim() ?? '',
  payosChecksumKey: process.env.PAYOS_CHECKSUM_KEY?.trim() ?? '',
  // Frontend page PayOS sends the browser back to (paid or cancelled); it calls GET /payments/payos-return
  payosReturnUrl: process.env.PAYOS_RETURN_URL ?? 'http://localhost:5173/wallet/topup/payos-result',
});
