import { type DueTimerRunResult, type DueTimerSource } from '../interfaces/order-timer.ports.js';

export type { DueTimerSource } from '../interfaces/order-timer.ports.js';

export type SourceRunResult = DueTimerRunResult | { error: string };

/** Chạy lần lượt từng source với cùng `now`; một source lỗi không chặn các source còn lại. */
export const runDueSources = async (
  sources: readonly DueTimerSource[],
  now: Date,
  log: Pick<Console, 'error'> = console,
): Promise<Record<string, SourceRunResult>> => {
  const results: Record<string, SourceRunResult> = {};
  for (const source of sources) {
    try {
      results[source.name] = await source.runDue(now);
    } catch (err) {
      log.error(`DueTimerSource [${source.name}] failed:`, err);
      results[source.name] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return results;
};
