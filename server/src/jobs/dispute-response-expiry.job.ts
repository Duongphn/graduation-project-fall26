import { type DisputeService } from '../services/dispute.service.js';
import { startIntervalJob } from './interval-job.js';

/** Every minute: disputes whose 72-hour response window is over go to admin review. */
export const startDisputeResponseExpiryJob = (
  service: DisputeService,
): ReturnType<typeof startIntervalJob> =>
  startIntervalJob('dispute-response-expiry', 60_000, () => service.expireResponses());
