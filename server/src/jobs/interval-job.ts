/**
 * Runs `task` every `intervalMs` in this process. A run never overlaps the previous one (a tick
 * that comes while a run is still going is skipped), errors are logged and never stop the
 * timer, and the timer is unref'd so it never keeps the process alive. Returns `stop`.
 */
export const startIntervalJob = (
  name: string,
  intervalMs: number,
  task: () => Promise<unknown>,
  log: Pick<Console, 'info' | 'error'> = console,
): { stop: () => void; runNow: () => Promise<void> } => {
  let running = false;
  const runNow = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await task();
      log.info(`[job ${name}]`, JSON.stringify(result ?? null));
    } catch (error) {
      log.error(`[job ${name}] failed.`, error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void runNow(), intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer), runNow };
};
