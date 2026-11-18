import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { CloudinaryIdentityStorage } from '../src/integrations/cloudinary/cloudinary-identity-storage.js';
import { identityVerificationUpload, userAvatarUpload } from '../src/middlewares/upload.middleware.js';
import { AppError } from '../src/utils/app-error.js';

const MB = 1024 * 1024;
const PNG_HEAD = Buffer.from('89504e470d0a1a0a', 'hex');
const png = (bytes: number) => Buffer.concat([PNG_HEAD, Buffer.alloc(bytes - PNG_HEAD.length)]);

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.post('/upload', handler, (_req, res) => {
    res.status(201).json({ ok: true });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as AppError;
    res.status(e.statusCode ?? 500).json({ code: e.code, message: e.message });
  });
  return app;
}

describe('upload size limits (R03 IV.2.3 Uploaded file safety)', () => {
  it('accepts an identity photo of 6 MB and refuses one of 9 MB (8 MB limit)', async () => {
    const app = appWith(identityVerificationUpload);
    const ok = await request(app)
      .post('/upload')
      .attach('frontImage', png(6 * MB), 'front.png')
      .attach('backImage', png(1000), 'back.png')
      .attach('selfie', png(1000), 'selfie.png');
    expect(ok.body.code).toBeUndefined();
    expect(ok.status).toBe(201);
    const tooBig = await request(app).post('/upload').attach('frontImage', png(9 * MB), 'front.png');
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.code).toBe('FILE_TOO_LARGE');
  });

  it('refuses an avatar above 2 MB', async () => {
    const app = appWith(userAvatarUpload);
    expect((await request(app).post('/upload').attach('avatar', png(1 * MB), 'a.png')).status).toBe(201);
    const tooBig = await request(app).post('/upload').attach('avatar', png(3 * MB), 'a.png');
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.code).toBe('FILE_TOO_LARGE');
  });
});

describe('signed links to identity photos (GB-35)', () => {
  it('expire after 10 minutes by default', async () => {
    const fakeClient = {
      uploader: {},
      utils: { private_download_url: (id: string) => `https://example.test/${id}` },
    } as unknown as ConstructorParameters<typeof CloudinaryIdentityStorage>[0];
    const storage = new CloudinaryIdentityStorage(fakeClient);
    const before = Date.now();
    const { expiresAt } = await storage.getAuthorizedDelivery('toyflow/identity/x');
    const seconds = (expiresAt.getTime() - before) / 1000;
    expect(seconds).toBeGreaterThan(590);
    expect(seconds).toBeLessThanOrEqual(601);
  });
});
