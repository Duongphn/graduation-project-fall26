import { featureEnv } from '../../config/feature-env.js';
import { expireStaleRequests } from '../../features/donation_requests/index.js';
import { startIntervalJob } from './interval-job.js';

// R03 job 9 "Close donation requests not accepted in time". R03 lists it daily at 3:00 AM,
// while the NFR "Scheduled deadlines" asks for automatic actions within 5 minutes of their
// deadline, so it runs every DONATION_EXPIRY_JOB_INTERVAL_MINUTES (default 5). Disabled with
// DONATION_EXPIRY_JOB_ENABLED=false, and never started when NODE_ENV=test.
export const startDonationExpiryJob = () => {
  if (!featureEnv.jobs.donationExpiry.enabled) return undefined;
  return startIntervalJob(
    'donation-expiry',
    featureEnv.jobs.donationExpiry.intervalMinutes * 60_000,
    () => expireStaleRequests(new Date()),
  );
};
