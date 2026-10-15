import { Buffer } from 'node:buffer';
import { Writable } from 'node:stream';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  identityVerificationUpload,
  validateIdentityImageBuffer,
} from '../src/features/identity_verifications/identity-verification-upload.js';
import type { StoredIdentityImage } from '../src/features/identity_verifications/identity-verification.ports.js';
import { CloudinaryIdentityStorage } from '../src/infrastructure/cloudinary/cloudinary-identity-storage.js';
import { errorHandler } from '../src/shared/middleware/error-handler.js';

// Sample valid image fixtures
const VALID_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const VALID_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // 'RIFF'
  0x1c, 0x00, 0x00, 0x00, // size
  0x57, 0x45, 0x42, 0x50, // 'WEBP'
  0x56, 0x50, 0x38, 0x20, // 'VP8 '
]);
const SVG_CONTENT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="5"/></svg>');
const TEXT_CONTENT = Buffer.from('this is plain text pretending to be an image');
const EXECUTABLE_CONTENT = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable

function createUploadApp() {
  const app = express();
  app.post(
    '/api/v1/identity-verifications',
    identityVerificationUpload,
    (req: Request, res: Response) => {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      res.status(200).json({
        success: true,
        receivedFields: files ? Object.keys(files) : [],
      });
    },
  );
  app.use(errorHandler);
  return app;
}

describe('identityVerificationUpload middleware', () => {
  it('accepts valid JPEG images for frontImage, backImage, and selfie', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.receivedFields).toEqual(
      expect.arrayContaining(['frontImage', 'backImage', 'selfie']),
    );
  });

  it('accepts valid PNG images for all 3 fields', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', VALID_PNG, { filename: 'front.png', contentType: 'image/png' })
      .attach('backImage', VALID_PNG, { filename: 'back.png', contentType: 'image/png' })
      .attach('selfie', VALID_PNG, { filename: 'selfie.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('accepts valid WebP images for all 3 fields', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', VALID_WEBP, { filename: 'front.webp', contentType: 'image/webp' })
      .attach('backImage', VALID_WEBP, { filename: 'back.webp', contentType: 'image/webp' })
      .attach('selfie', VALID_WEBP, { filename: 'selfie.webp', contentType: 'image/webp' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects with MISSING_REQUIRED_IMAGE when frontImage is missing', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_IMAGE');
    expect(res.body.error.message).toContain('frontImage');
  });

  it('rejects with MISSING_REQUIRED_IMAGE when backImage is missing', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_IMAGE');
    expect(res.body.error.message).toContain('backImage');
  });

  it('rejects with MISSING_REQUIRED_IMAGE when selfie is missing', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_IMAGE');
    expect(res.body.error.message).toContain('selfie');
  });

  it('rejects with MISSING_REQUIRED_IMAGE when no files are uploaded', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .field('idCardNumber', '012345678901');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_REQUIRED_IMAGE');
  });

  it('rejects with UNEXPECTED_FIELD when unexpected file field is sent', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', VALID_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' })
      .attach('unauthorizedDoc', VALID_JPEG, { filename: 'extra.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNEXPECTED_FIELD');
  });

  it('rejects with FILE_TOO_LARGE when file exceeds 5 MB', async () => {
    const app = createUploadApp();
    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 10, 0xff);
    // Write valid JPEG header at start
    VALID_JPEG.copy(largeBuffer, 0, 0, VALID_JPEG.length);

    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', largeBuffer, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects SVG images with INVALID_IMAGE_TYPE', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', SVG_CONTENT, { filename: 'front.svg', contentType: 'image/svg+xml' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE_TYPE');
  });

  it('rejects false MIME vs signature mismatch (JPEG bytes claiming to be PNG)', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', VALID_JPEG, { filename: 'front.png', contentType: 'image/png' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE_TYPE');
  });

  it('rejects executable file claiming to be JPEG', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', EXECUTABLE_CONTENT, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE_TYPE');
  });

  it('rejects plain text pretending to be JPEG', async () => {
    const app = createUploadApp();
    const res = await request(app)
      .post('/api/v1/identity-verifications')
      .attach('frontImage', TEXT_CONTENT, { filename: 'front.jpg', contentType: 'image/jpeg' })
      .attach('backImage', VALID_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' })
      .attach('selfie', VALID_JPEG, { filename: 'selfie.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_IMAGE_TYPE');
  });
});

describe('validateIdentityImageBuffer helper', () => {
  it('returns image/jpeg for valid JPEG buffer', () => {
    expect(validateIdentityImageBuffer(VALID_JPEG, 'image/jpeg')).toBe('image/jpeg');
  });

  it('returns image/png for valid PNG buffer', () => {
    expect(validateIdentityImageBuffer(VALID_PNG, 'image/png')).toBe('image/png');
  });

  it('returns image/webp for valid WebP buffer', () => {
    expect(validateIdentityImageBuffer(VALID_WEBP, 'image/webp')).toBe('image/webp');
  });

  it('throws INVALID_IMAGE_TYPE for empty buffer or buffer smaller than signature length', () => {
    expect(() => validateIdentityImageBuffer(Buffer.alloc(2), 'image/jpeg')).toThrowError(
      expect.objectContaining({ code: 'INVALID_IMAGE_TYPE' }),
    );
  });

  it('throws INVALID_IMAGE_TYPE for SVG content', () => {
    expect(() => validateIdentityImageBuffer(SVG_CONTENT, 'image/svg+xml')).toThrowError(
      expect.objectContaining({ code: 'INVALID_IMAGE_TYPE' }),
    );
  });

  it('throws INVALID_IMAGE_TYPE for false MIME mismatch', () => {
    expect(() => validateIdentityImageBuffer(VALID_PNG, 'image/jpeg')).toThrowError(
      expect.objectContaining({ code: 'INVALID_IMAGE_TYPE' }),
    );
  });
});

describe('CloudinaryIdentityStorage', () => {
  function createMockCloudinaryClient() {
    let uploadedOptions: Record<string, unknown> | null = null;
    let deletedIds: string[] | null = null;
    let deletedOptions: Record<string, unknown> | null = null;

    const mockClient = {
      uploader: {
        upload_stream: vi.fn((options: Record<string, unknown>, callback: (err: Error | null, result?: unknown) => void) => {
          uploadedOptions = options;
          const stream = new Writable({
            write(_chunk: unknown, _encoding: unknown, cb: () => void) {
              cb();
            },
          });
          stream.on('finish', () => {
            callback(null, {
              public_id: `${options.folder}/mock-uuid-123`,
              resource_type: 'image',
              type: options.type,
            });
          });
          return stream;
        }),
      },
      api: {
        delete_resources: vi.fn(async (publicIds: string[], options?: Record<string, unknown>) => {
          deletedIds = publicIds;
          deletedOptions = options ?? null;
          return { deleted: publicIds.reduce((acc, id) => ({ ...acc, [id]: 'deleted' }), {}) };
        }),
      },
      utils: {
        private_download_url: vi.fn((publicId: string, format: string, options: Record<string, unknown>) => {
          return `https://api.cloudinary.com/v1_1/test/image/download?public_id=${encodeURIComponent(publicId)}&expires_at=${options.expires_at}&signature=mock-sig`;
        }),
      },
    };

    return {
      client: mockClient as any,
      getUploadedOptions: () => uploadedOptions,
      getDeletedIds: () => deletedIds,
      getDeletedOptions: () => deletedOptions,
    };
  }

  it('uploads buffer with type authenticated and folder toyflow/identity', async () => {
    const { client, getUploadedOptions } = createMockCloudinaryClient();
    const storage = new CloudinaryIdentityStorage({ client });

    const result = await storage.upload(VALID_JPEG, 'image/jpeg');

    expect(result).toEqual({
      publicId: 'toyflow/identity/mock-uuid-123',
      deliveryType: 'authenticated',
    });
    expect(getUploadedOptions()).toMatchObject({
      folder: 'toyflow/identity',
      resource_type: 'image',
      type: 'authenticated',
    });
  });

  it('deletes resources by publicId passing type authenticated', async () => {
    const { client, getDeletedIds, getDeletedOptions } = createMockCloudinaryClient();
    const storage = new CloudinaryIdentityStorage({ client });

    const images: StoredIdentityImage[] = [
      { publicId: 'toyflow/identity/img-1', deliveryType: 'authenticated' },
      { publicId: 'toyflow/identity/img-2', deliveryType: 'authenticated' },
    ];

    await storage.delete(images);

    expect(getDeletedIds()).toEqual(['toyflow/identity/img-1', 'toyflow/identity/img-2']);
    expect(getDeletedOptions()).toEqual({ type: 'authenticated' });
  });

  it('does nothing when delete is called with empty array', async () => {
    const { client } = createMockCloudinaryClient();
    const storage = new CloudinaryIdentityStorage({ client });

    await storage.delete([]);
    expect(client.api.delete_resources).not.toHaveBeenCalled();
  });

  it('generates authorized delivery with signed URL and expiresAt Date', async () => {
    const { client } = createMockCloudinaryClient();
    const storage = new CloudinaryIdentityStorage({ client, expiresInSeconds: 1800 });

    const before = Date.now();
    const delivery = await storage.getAuthorizedDelivery('toyflow/identity/img-1');
    const after = Date.now();

    expect(delivery.url).toContain('toyflow%2Fidentity%2Fimg-1');
    expect(delivery.url).toContain('expires_at=');
    expect(delivery.expiresAt).toBeInstanceOf(Date);
    // Should be approximately now + 1800 seconds
    const expectedExpiryMs = before + 1800 * 1000;
    expect(delivery.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiryMs - 1000);
    expect(delivery.expiresAt.getTime()).toBeLessThanOrEqual(after + 1800 * 1000 + 1000);
  });

  it('rejects empty or whitespace publicId in getAuthorizedDelivery', async () => {
    const { client } = createMockCloudinaryClient();
    const storage = new CloudinaryIdentityStorage({ client });

    await expect(storage.getAuthorizedDelivery('')).rejects.toThrow();
    await expect(storage.getAuthorizedDelivery('   ')).rejects.toThrow();
  });
});
