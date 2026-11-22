import { featureEnv } from '../config/feature-env.js';
import { releaseExpiredLocks } from '../services/account-lock.service.js';
import { startIntervalJob } from './interval-job.js';

// Ends the Admin account locks of 7 or 30 days once they have run out (UC29), every
// ACCOUNT_UNLOCK_JOB_INTERVAL_MINUTES (default 15, like JOB-01): the account is Active again, the
// listings the lock hid are shown again and the user is notified. Disabled with
// ACCOUNT_UNLOCK_JOB_ENABLED=false, and never started when NODE_ENV=test.
export const startAccountUnlockJob = () => {
  if (!featureEnv.jobs.accountUnlock.enabled) return undefined;
  return startIntervalJob(
    'account-unlock',
    featureEnv.jobs.accountUnlock.intervalMinutes * 60_000,
    () => releaseExpiredLocks(new Date()),
  );
};
