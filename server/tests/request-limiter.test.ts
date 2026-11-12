import { describe, expect, it } from 'vitest';

import { GeminiAdvisorClient } from '../src/integrations/ai/gemini.client.js';
import { RequestLimiter, RequestQueueFullError } from '../src/integrations/ai/request-limiter.js';

const REQUEST = {
  systemInstruction: 'system',
  prompt: 'prompt',
  responseJsonSchema: { type: 'object' },
  maxOutputTokens: 300,
};

describe('RequestLimiter', () => {
  it('lets requests through at once up to the limit', async () => {
    const limiter = new RequestLimiter({ maxRequests: 3, windowMs: 1_000, maxWaitMs: 500 });
    const startedAt = Date.now();

    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);

    expect(Date.now() - startedAt).toBeLessThan(50);
  });

  it('queues the next request until the oldest one leaves the window', async () => {
    const limiter = new RequestLimiter({ maxRequests: 2, windowMs: 120, maxWaitMs: 500 });
    await limiter.acquire();
    await limiter.acquire();
    const startedAt = Date.now();

    await limiter.acquire();

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(100);
  });

  it('serves the queue first come, first served', async () => {
    const limiter = new RequestLimiter({ maxRequests: 3, windowMs: 80, maxWaitMs: 500 });
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);
    const order: number[] = [];

    await Promise.all([1, 2, 3].map((n) => limiter.acquire().then(() => order.push(n))));

    expect(order).toEqual([1, 2, 3]);
  });

  it('refuses at once when the wait would be longer than maxWaitMs', async () => {
    const limiter = new RequestLimiter({ maxRequests: 1, windowMs: 10_000, maxWaitMs: 100 });
    await limiter.acquire();
    const startedAt = Date.now();

    await expect(limiter.acquire()).rejects.toBeInstanceOf(RequestQueueFullError);
    expect(Date.now() - startedAt).toBeLessThan(50);
  });

  it('keeps Gemini from being called when the queue is full', async () => {
    let calls = 0;
    const client = new GeminiAdvisorClient({
      apiKey: '',
      modelName: 'gemini-x',
      timeoutMs: null,
      limiter: new RequestLimiter({ maxRequests: 1, windowMs: 10_000, maxWaitMs: 100 }),
      models: {
        generateContent: async () => {
          calls += 1;
          return { text: '{}' };
        },
      },
    });

    await client.generateJson(REQUEST);
    await expect(client.generateJson(REQUEST)).rejects.toThrow('hàng chờ');
    expect(calls).toBe(1);
  });
});
