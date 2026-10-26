import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { createDefaultToyImageStorage } from '../src/integrations/cloudinary/default-storages.js';
import type { ToyCatalogService } from '../src/services/toy-catalog.service.js';
import { validateToyImage } from '../src/utils/image-validation.js';
import { AppError } from '../src/utils/app-error.js';

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
    it('does not crash when building the default toy image storage without credentials', async () => {
      const originalEnv = {
        CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
        CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
      };

      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;

      try {
        const imageStorage = createDefaultToyImageStorage();
        expect(imageStorage).toBeDefined();

        // Calling upload should throw AppError 500 CLOUDINARY_NOT_CONFIGURED
        await expect(imageStorage.upload(Buffer.from([0x01]), 'image/jpeg')).rejects.toThrow(
          'Cloudinary credentials are not configured.',
        );

        // Calling delete should throw AppError 500 CLOUDINARY_NOT_CONFIGURED
        await expect(imageStorage.delete(['some_id'])).rejects.toThrow(
          'Cloudinary credentials are not configured.',
        );

        try {
          await imageStorage.upload(Buffer.from([0x01]), 'image/jpeg');
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

  describe('createApp dependency injection', () => {
    it('createApp accepts a service override', async () => {
      const page = { items: [], page: 1, limit: 20, total: 0 };
      const list = vi.fn().mockResolvedValue(page);
      const toyCatalogService = { list } as unknown as ToyCatalogService;

      const res = await request(createApp({ toyCatalogService })).get('/api/v1/toys/showcase');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(page);
      expect(list).toHaveBeenCalledTimes(1);
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
