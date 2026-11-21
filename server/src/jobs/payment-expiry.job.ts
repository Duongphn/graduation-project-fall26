import { featureEnv } from '../config/feature-env.js';
import type { PaymentService } from '../services/payment.service.js';
import type { PayosTopupService } from '../services/payos-topup.service.js';
import { startIntervalJob } from './interval-job.js';

// UC17: top-ups nobody paid (link expired + grace period) become failed, so no payment stays
// pending forever. PayOS ones are checked with PayOS first and credited if the transfer arrived. Runs every PAYMENT_EXPIRY_JOB_INTERVAL_MINUTES (default 5); disabled
// with PAYMENT_EXPIRY_JOB_ENABLED=false, never started when NODE_ENV=test.
export const startPaymentExpiryJob = (payments: PaymentService, payos: PayosTopupService) => {
  if (!featureEnv.jobs.paymentExpiry.enabled) return undefined;
  return startIntervalJob('payment-expiry', featureEnv.jobs.paymentExpiry.intervalMinutes * 60_000, async () => ({
    vnpay: await payments.expireStalePayments(),
    payos: await payos.reconcileExpired(),
  }));
};
