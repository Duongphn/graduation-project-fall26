/** Hàng chờ đã đầy: phải chờ quá lâu mới tới lượt nên trả lỗi ngay để service chuyển sang fallback. */
export class RequestQueueFullError extends Error {
  public constructor(maxWaitMs: number) {
    super(`Gemini đang đủ lượt gọi trong phút này, hàng chờ vượt quá ${maxWaitMs / 1000} giây.`);
    this.name = 'RequestQueueFullError';
  }
}

export interface RequestLimiterOptions {
  /** Số request tối đa trong mỗi cửa sổ thời gian (ví dụ 15 request/phút của gói miễn phí). */
  maxRequests: number;
  windowMs: number;
  /** Chờ trong hàng tối đa bao lâu; biết trước sẽ phải chờ lâu hơn thì từ chối ngay. */
  maxWaitMs: number;
}

/**
 * Giới hạn số request gửi lên Gemini trong một cửa sổ trượt (mặc định 60 giây) để không bị Google
 * trả 429. Request vượt mức xếp hàng theo thứ tự đến trước và đi ngay khi có lượt trống.
 * Chỉ đếm trong một tiến trình server (đủ khi chạy một server; nhiều server thì cần Redis).
 */
export class RequestLimiter {
  /** Thời điểm các request đã được cho đi trong cửa sổ hiện tại, cũ nhất trước. */
  private readonly sent: number[] = [];
  private readonly waiting: Array<() => void> = [];
  private timer: NodeJS.Timeout | null = null;

  public constructor(private readonly options: RequestLimiterOptions) {}

  /** Chờ tới lượt; ném RequestQueueFullError nếu phải chờ quá maxWaitMs. */
  public acquire(): Promise<void> {
    const now = Date.now();
    this.prune(now);
    if (this.waiting.length === 0 && this.sent.length < this.options.maxRequests) {
      this.sent.push(now);
      return Promise.resolve();
    }
    // Người thứ k trong hàng nhận lượt khi request thứ k trong cửa sổ hết hạn: tính trước được.
    const freeAt = this.slotFreeAt(this.waiting.length, now);
    if (freeAt - now > this.options.maxWaitMs) {
      return Promise.reject(new RequestQueueFullError(this.options.maxWaitMs));
    }
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.schedule(now);
    });
  }

  private slotFreeAt(position: number, now: number): number {
    const freeNow = this.options.maxRequests - this.sent.length;
    if (position < freeNow) return now;
    const expiring = this.sent[position - Math.max(freeNow, 0)];
    return expiring === undefined ? Number.POSITIVE_INFINITY : expiring + this.options.windowMs;
  }

  private prune(now: number) {
    while (this.sent.length > 0 && this.sent[0]! + this.options.windowMs <= now) this.sent.shift();
  }

  private drain() {
    const now = Date.now();
    this.prune(now);
    while (this.waiting.length > 0 && this.sent.length < this.options.maxRequests) {
      this.sent.push(now);
      this.waiting.shift()!();
    }
    this.schedule(now);
  }

  private schedule(now: number) {
    if (this.timer || this.waiting.length === 0) return;
    const oldest = this.sent[0];
    const delay = oldest === undefined ? 0 : Math.max(0, oldest + this.options.windowMs - now);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, delay);
    // Không giữ tiến trình sống chỉ vì hàng chờ (tắt server, chạy test).
    this.timer.unref();
  }
}
