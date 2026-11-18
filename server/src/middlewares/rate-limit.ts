import type { RequestHandler } from 'express';

import { AppError } from '../utils/app-error.js';

export interface RateLimitOptions {
  /** Length of the window in milliseconds. */
  windowMs: number;
  /** Requests allowed in one window for one client and one route. */
  max: number;
  /** When false the middleware lets every request through (unit tests of other features). */
  enabled?: boolean;
  now?: () => number;
}

/**
 * Small in-memory fixed-window limiter (one server instance, R5.0 I.1 b). The key is the client
 * IP plus the route path, so each /auth action has its own budget. Over the limit the API answers
 * 429 RATE_LIMITED with a Retry-After header (R5.0 I.2.1 Security; R03 IV.2.3 Abuse prevention).
 */
export const createRateLimiter = ({ windowMs, max, enabled = true, now = Date.now }: RateLimitOptions): RequestHandler => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    if (!enabled) return next();

    const time = now();
    const key = `${req.ip ?? 'unknown'}|${req.baseUrl}${req.path}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      if (hits.size > 50_000) {
        for (const [k, v] of hits) if (v.resetAt <= time) hits.delete(k);
      }
      entry = { count: 0, resetAt: time + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return next(
        new AppError(429, 'RATE_LIMITED', `Bạn thao tác quá nhanh. Vui lòng thử lại sau ${retryAfter} giây.`, {
          retryAfterSeconds: retryAfter,
        }),
      );
    }
    next();
  };
};
