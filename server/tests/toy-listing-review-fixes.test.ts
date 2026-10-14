import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';

import { createApiRouter } from '../src/app/router.js';
import {
  createToyListingDependencies,
  type ToyListingDependencies,
} from '../src/app/toy-listing-dependencies.js';
import { validateToyImage } from '../src/features/toys/toy-image-upload.js';
import { AppError } from '../src/shared/errors/app-error.js';

describe('UC04 final review fixes', () => {
  describe('validateToyImage MIME type error formatting', () => {
    const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

    it('formats missing / undefined MIME type as "provided"', () => {
      expect(() => validateToyImage(validJpegBuffer, undefined)).toThrowError(
        'Unsupported image format provided. Allowed formats are JPEG, PNG, and WebP.',
      );

      try {
        validateToyImage(validJpegBuffer, undefined);
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).statusCode).toBe(400);
        expect((err as AppError).code).toBe('INVALID_IMAGE_FORMAT');
      }
    });

    it('formats empty string MIME type as "provided"', () => {
      expect(() => validateToyImage(validJpegBuffer, '')).toThrowError(
        'Unsupported image format provided. Allowed formats are JPEG, PNG, and WebP.',
      );
    });

    it('formats unsupported MIME type with quotes', () => {
      expect(() => validateToyImage(validJpegBuffer, 'image/gif')).toThrowError(
        'Unsupported image format "image/gif". Allowed formats are JPEG, PNG, and WebP.',
      );
    });
  });

  describe('Cloudinary lazy initialization on missing credentials', () => {
    it('does not crash during createToyListingDependencies even if credentials are empty', async () => {
      const originalEnv = {
        CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
      };

      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;

      try {
        const deps = createToyListingDependencies();
        expect(deps).toBeDefined();
        expect(deps.router).toBeDefined();
        expect(deps.imageStorage).toBeDefined();

        // Calling upload should throw AppError 500 CLOUDINARY_NOT_CONFIGURED
        await expect(deps.imageStorage.upload(Buffer.from([0x01]), 'image/jpeg')).rejects.toThrow(
          'Cloudinary credentials are not configured.',
        );

        // Calling delete should throw AppError 500 CLOUDINARY_NOT_CONFIGURED
        await expect(deps.imageStorage.delete(['some_id'])).rejects.toThrow(
          'Cloudinary credentials are not configured.',
        );

        try {
          await deps.imageStorage.upload(Buffer.from([0x01]), 'image/jpeg');
        } catch (err) {
          expect(err).toBeInstanceOf(AppError);
          expect((err as AppError).statusCode).toBe(500);
          expect((err as AppError).code).toBe('CLOUDINARY_NOT_CONFIGURED');
        }
      } finally {
        if (originalEnv.CLOUDINARY_CLOUD_NAME) {
          process.env.CLOUDINARY_CLOUD_NAME = originalEnv.CLOUDINARY_CLOUD_NAME;
        }
        if (originalEnv.CLOUDINARY_API_KEY) {
          process.env.CLOUDINARY_API_KEY = originalEnv.CLOUDINARY_API_KEY;
        }
        if (originalEnv.CLOUDINARY_API_SECRET) {
          process.env.CLOUDINARY_API_SECRET = originalEnv.CLOUDINARY_API_SECRET;
        }
      }
    });
  });

  describe('createApiRouter dependency injection', () => {
    it('allows injecting custom toyListingDependencies into createApiRouter', async () => {
      const mockRouter = express.Router();
      mockRouter.get('/test-route', (_req, res) => {
        res.json({ injected: true });
      });

      const customDeps = {
        router: mockRouter,
      } as ToyListingDependencies;

      const app = express();
      app.use('/api/v1', createApiRouter({ toyListingDependencies: customDeps }));

      const res = await request(app).get('/api/v1/toys/test-route');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ injected: true });
    });
  });

  describe('terminal order status regex flexibility', () => {
    const TERMINAL_ORDER_STATUS_REGEX = /^(completed|rejected|cancell?ed|expired)$/i;

    it('matches both cancelled and canceled in various casings', () => {
      expect(TERMINAL_ORDER_STATUS_REGEX.test('cancelled')).toBe(true);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('CANCELLED')).toBe(true);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('canceled')).toBe(true);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('CANCELED')).toBe(true);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('completed')).toBe(true);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('rejected')).toBe(true);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('expired')).toBe(true);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('pending')).toBe(false);
      expect(TERMINAL_ORDER_STATUS_REGEX.test('active')).toBe(false);
    });
  });
});
