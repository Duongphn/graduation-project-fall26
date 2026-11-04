import 'dotenv/config';

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
};

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parsePort(process.env.PORT),
  mongoDbUri: process.env.MONGODB_URI ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',

  // Email SMTP
  emailHost: process.env.EMAIL_HOST ?? 'smtp.gmail.com',
  emailPort: Number(process.env.EMAIL_PORT ?? 587),
  emailUser: process.env.EMAIL_USER ?? '',
  emailAppPassword: process.env.EMAIL_APP_PASSWORD ?? '',

  // JWT
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'default_access_secret',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'default_refresh_secret',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? '',
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? '',

  // VNPay Sandbox
  vnpayTmnCode: process.env.VNPAY_TMN_CODE ?? '',
  vnpayHashSecret: process.env.VNPAY_HASH_SECRET ?? '',
  vnpayUrl: process.env.VNPAY_URL ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  vnpayApiUrl: process.env.VNPAY_API_URL ?? 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
  vnpayReturnUrl: process.env.VNPAY_RETURN_URL ?? 'http://localhost:5173/wallet/topup/result',
  vnpayIpnUrl: process.env.VNPAY_IPN_URL ?? '',
});
