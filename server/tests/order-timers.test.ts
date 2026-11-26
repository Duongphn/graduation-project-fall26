import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDueSources, type DueTimerSource } from '../src/jobs/due-timer-source.js';
import { startOrderTimersJob } from '../src/jobs/order-timers.job.js';

describe('Order timers runner and job', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('runs every source with the same now and returns per-source results', async () => {
    const seen: Date[] = [];
    const a: DueTimerSource = {
      name: 'a',
      runDue: async (now: Date) => {
        seen.push(now);
        return { processed: 2, failed: 0 };
      },
    };
    const b: DueTimerSource = {
      name: 'b',
      runDue: async (now: Date) => {
        seen.push(now);
        return { processed: 0, failed: 1 };
      },
    };
    const now = new Date('2026-11-01T00:00:00Z');
    expect(await runDueSources([a, b], now)).toEqual({
      a: { processed: 2, failed: 0 },
      b: { processed: 0, failed: 1 },
    });
    expect(seen).toEqual([now, now]);
  });

  it('isolates a throwing source', async () => {
    const log = { error: vi.fn() };
    const bad: DueTimerSource = {
      name: 'bad',
      runDue: async () => {
        throw new Error('boom');
      },
    };
    const good: DueTimerSource = {
      name: 'good',
      runDue: async () => ({ processed: 1, failed: 0 }),
    };
    const r = await runDueSources([bad, good], new Date(), log);
    expect(r.bad).toEqual({ error: 'boom' });
    expect(r.good).toEqual({ processed: 1, failed: 0 });
    expect(log.error).toHaveBeenCalledOnce();
  });

  describe('featureEnv.jobs.orderTimers configuration', () => {
    it('is enabled by default in development with 1 minute interval', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ORDER_TIMERS_JOB_ENABLED', '');
      vi.stubEnv('RENTAL_SCHEDULER_ENABLED', '');
      const { featureEnv } = await import('../src/config/feature-env.js');
      expect(featureEnv.jobs.orderTimers.enabled).toBe(true);
      expect(featureEnv.jobs.orderTimers.intervalMinutes).toBe(1);
    });

    it('is disabled when ORDER_TIMERS_JOB_ENABLED=false', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ORDER_TIMERS_JOB_ENABLED', 'false');
      const { featureEnv } = await import('../src/config/feature-env.js');
      expect(featureEnv.jobs.orderTimers.enabled).toBe(false);
    });

    it('is disabled when RENTAL_SCHEDULER_ENABLED=false (alias)', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ORDER_TIMERS_JOB_ENABLED', 'true');
      vi.stubEnv('RENTAL_SCHEDULER_ENABLED', 'false');
      const { featureEnv } = await import('../src/config/feature-env.js');
      expect(featureEnv.jobs.orderTimers.enabled).toBe(false);
    });

    it('is disabled when NODE_ENV=test', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      const { featureEnv } = await import('../src/config/feature-env.js');
      expect(featureEnv.jobs.orderTimers.enabled).toBe(false);
    });

    it('throws when ORDER_TIMERS_JOB_INTERVAL_MINUTES=0', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ORDER_TIMERS_JOB_INTERVAL_MINUTES', '0');
      await expect(import('../src/config/feature-env.js')).rejects.toThrow(
        'ORDER_TIMERS_JOB_INTERVAL_MINUTES must be a positive number',
      );
    });
  });

  describe('startOrderTimersJob', () => {
    it('returns undefined when disabled', async () => {
      vi.stubEnv('NODE_ENV', 'test');
      const job = startOrderTimersJob([]);
      expect(job).toBeUndefined();
    });
  });
});
