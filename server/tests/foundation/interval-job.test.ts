import { afterEach, describe, expect, it, vi } from 'vitest';

import { startIntervalJob } from '../../src/app/jobs/interval-job.js';

const silent = { info: vi.fn(), error: vi.fn() };

afterEach(() => {
  vi.useRealTimers();
});

describe('startIntervalJob', () => {
  it('runs on every tick, never overlaps, survives errors and stops', async () => {
    vi.useFakeTimers();
    let release: () => void = () => undefined;
    let calls = 0;
    const task = vi.fn(async () => {
      calls += 1;
      if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
      if (calls === 2) throw new Error('boom');
      return { ok: calls };
    });
    const job = startIntervalJob('test', 1_000, task, silent);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(1);
    // The first run is still going: the next ticks are skipped.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(task).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(silent.error).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(task).toHaveBeenCalledTimes(3);

    job.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('is disabled in tests by the env config', async () => {
    const { env } = await import('../../src/config/env.js');
    expect(env.jobs.donationExpiry.enabled).toBe(false);
    expect(env.jobs.donationExpiry.intervalMinutes).toBeGreaterThan(0);
  });
});
