import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app/create-app.js';

describe('health endpoint', () => {
  it('returns the service status', async () => {
    const response = await request(createApp()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'toyflow-backend',
    });
  });
});
