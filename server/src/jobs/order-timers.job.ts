import { featureEnv } from '../config/feature-env.js';
import { type DueTimerSource, runDueSources } from './due-timer-source.js';
import { startIntervalJob } from './interval-job.js';

export const startOrderTimersJob = (
  sources: readonly DueTimerSource[],
): { stop: () => void; runNow: () => Promise<void> } | undefined => {
  if (!featureEnv.jobs.orderTimers.enabled) return undefined;
  return startIntervalJob(
    'order-timers',
    featureEnv.jobs.orderTimers.intervalMinutes * 60_000,
    () => runDueSources(sources, new Date()),
  );
};
