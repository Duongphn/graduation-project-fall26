import { featureEnv } from '../config/feature-env.js';
import type { PurchaseOrderService } from '../services/purchase-order.service.js';
import { startIntervalJob } from './interval-job.js';

// UC12/UC13 deadlines: a PAID order the seller did not ship within 48 hours is cancelled and the
// buyer refunded; a SHIPPING order the buyer neither confirmed nor disputed within 7 days is
// completed and the seller paid. Runs every PURCHASE_ORDER_TIMER_JOB_INTERVAL_MINUTES (default 5);
// disabled with PURCHASE_ORDER_TIMER_JOB_ENABLED=false, never started when NODE_ENV=test.
export const startPurchaseOrderTimerJob = (purchases: PurchaseOrderService) => {
  if (!featureEnv.jobs.purchaseOrderTimer.enabled) return undefined;
  return startIntervalJob(
    'purchase-order-timer',
    featureEnv.jobs.purchaseOrderTimer.intervalMinutes * 60_000,
    () => purchases.runDueTimers(),
  );
};
