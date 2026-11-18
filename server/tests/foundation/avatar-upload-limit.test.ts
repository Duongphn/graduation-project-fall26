import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from '../../src/middlewares/error-handler.js';
import { MAX_AVATAR_BYTES, userAvatarUpload } from '../../src/middlewares/upload.middleware.js';

// R05 TC-SEC-025: avatars are limited to 2 MB (R03 IV.2.3 Uploaded file safety).
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const jpeg = (bytes: number) => {
  const buffer = Buffer.alloc(bytes, 0);
  JPEG_HEAD.copy(buffer);
  return buffer;
};

const app = express();
app.post('/avatar', userAvatarUpload, (req: Request, res: Response) => {
  res.status(200).json({ size: req.file?.size });
});
app.use(errorHandler);

describe('avatar upload limit (TC-SEC-025)', () => {
  it('accepts an avatar of 1.9 MB', async () => {
    const res = await request(app).post('/avatar').attach('avatar', jpeg(Math.round(1.9 * 1024 * 1024)), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
  });

  it('refuses an avatar over 2 MB with FILE_TOO_LARGE', async () => {
    expect(MAX_AVATAR_BYTES).toBe(2 * 1024 * 1024);
    const res = await request(app).post('/avatar').attach('avatar', jpeg(Math.round(2.5 * 1024 * 1024)), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(res.body.error.message).toContain('2 MB');
  });
});
