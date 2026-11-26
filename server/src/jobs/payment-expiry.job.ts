import { featureEnv } from '../config/feature-env.js';
import type { PayosTopupService } from '../services/payos-topup.service.js';
import { startIntervalJob } from './interval-job.js';

// UC17: PayOS top-ups nobody paid (link expired + grace period) are checked with PayOS: credited if
// the transfer arrived, otherwise failed, so no payment stays pending forever. Runs every
// PAYMENT_EXPIRY_JOB_INTERVAL_MINUTES (default 5); disabled with PAYMENT_EXPIRY_JOB_ENABLED=false,
// never started when NODE_ENV=test.
export const startPaymentExpiryJob = (payos: PayosTopupService) => {
  if (!featureEnv.jobs.paymentExpiry.enabled) return undefined;
  return startIntervalJob('payment-expiry', featureEnv.jobs.paymentExpiry.intervalMinutes * 60_000, async () => ({
    payos: await payos.reconcileExpired(),
  }));
};
