export interface DueTimerRunResult {
  processed: number;
  failed: number;
}

/**
 * Một loại đơn có timer (rental, sau này purchase) mà job order-timers chạy mỗi tick.
 * `runDue` xử lý các timer có `dueAt <= now`; lỗi của từng đơn tự ghi log và đếm vào `failed`.
 */
export interface DueTimerSource {
  name: string;
  runDue(now: Date): Promise<DueTimerRunResult>;
}
