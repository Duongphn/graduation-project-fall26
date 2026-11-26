import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('error handler (TC-SEC-021: no internal details)', () => {
  it('answers 400 INVALID_JSON for a malformed JSON body', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{bad json');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(response.body)).not.toMatch(/property name|position|SyntaxError/i);
  });

  it('answers 413 PAYLOAD_TOO_LARGE for a JSON body over 1 MB', async () => {
    const big = JSON.stringify({ email: 'a@b.c', padding: 'x'.repeat(1024 * 1024 + 10) });
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(big);

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(JSON.stringify(response.body)).not.toMatch(/request entity too large/i);
  });

  it('keeps other exposed 4xx statuses with a generic code', async () => {
    const response = await request(createApp())
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json; charset=klingon')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(JSON.stringify(response.body)).not.toMatch(/klingon/);
  });

  it('hides the message and stack of unexpected errors and logs them on the server', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.get('/boom', () => {
      throw new Error('MongoServerError: connection to 10.0.0.5:27017 refused');
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/Mongo|27017|stack/);
    expect(log).toHaveBeenCalledWith('[Unhandled Error]:', expect.any(Error));
  });

  it('does not expose 5xx http errors even when they carry a status', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = express();
    app.get('/boom', () => {
      throw Object.assign(new Error('upstream secret'), { status: 503, expose: false });
    });
    app.use(errorHandler);

    const response = await request(app).get('/boom');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toMatch(/upstream secret/);
  });
});
