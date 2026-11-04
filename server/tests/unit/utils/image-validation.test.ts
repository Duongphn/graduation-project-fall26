import { describe, expect, it } from 'vitest';

import {
  validateToyImage,
  validateIdentityImageBuffer,
} from '../../../src/utils/image-validation.js';
import { AppError } from '../../../src/utils/app-error.js';

// ── Helper: tạo buffer giả với header byte chuẩn ──

const jpegBuffer = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

const pngBuffer = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const webpBuffer = () => {
  const buf = Buffer.alloc(16);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(100, 4);
  buf.write('WEBP', 8);
  return buf;
};

/** Buffer không khớp bất kỳ signature nào */
const unknownBuffer = () => Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]);

// ──────────────────────────────────────────────
// validateToyImage
// ──────────────────────────────────────────────
describe('validateToyImage', () => {
  // ── Happy path ──
  it('returns "image/jpeg" for valid JPEG buffer + mime', () => {
    expect(validateToyImage(jpegBuffer(), 'image/jpeg')).toBe('image/jpeg');
  });

  it('returns "image/png" for valid PNG buffer + mime', () => {
    expect(validateToyImage(pngBuffer(), 'image/png')).toBe('image/png');
  });

  it('returns "image/webp" for valid WebP buffer + mime', () => {
    expect(validateToyImage(webpBuffer(), 'image/webp')).toBe('image/webp');
  });

  it('normalizes "image/jpg" to "image/jpeg"', () => {
    expect(validateToyImage(jpegBuffer(), 'image/jpg')).toBe('image/jpeg');
  });

  it('handles MIME with charset parameter (e.g. "image/jpeg; charset=utf-8")', () => {
    expect(validateToyImage(jpegBuffer(), 'image/jpeg; charset=utf-8')).toBe('image/jpeg');
  });

  it('is case-insensitive for MIME type', () => {
    expect(validateToyImage(jpegBuffer(), 'IMAGE/JPEG')).toBe('image/jpeg');
  });

  // ── Error cases: invalid buffer ──
  it('throws AppError on empty buffer', () => {
    expect(() => validateToyImage(Buffer.alloc(0), 'image/png')).toThrow(AppError);
  });

  it('throws AppError on buffer too small (< 3 bytes)', () => {
    expect(() => validateToyImage(Buffer.from([0x89, 0x50]), 'image/png')).toThrow(AppError);
  });

  it('throws on null buffer', () => {
    expect(() => validateToyImage(null as any, 'image/png')).toThrow(AppError);
  });

  // ── Error cases: MIME/signature mismatch ──
  it('throws when MIME says jpeg but content is PNG', () => {
    expect(() => validateToyImage(pngBuffer(), 'image/jpeg')).toThrow('does not match JPEG');
  });

  it('throws when MIME says png but content is JPEG', () => {
    expect(() => validateToyImage(jpegBuffer(), 'image/png')).toThrow('does not match PNG');
  });

  it('throws when MIME says webp but content is JPEG', () => {
    expect(() => validateToyImage(jpegBuffer(), 'image/webp')).toThrow('does not match WebP');
  });

  // ── Error cases: unsupported format ──
  it('throws on unsupported MIME type (image/gif)', () => {
    expect(() => validateToyImage(jpegBuffer(), 'image/gif')).toThrow('Unsupported image format');
  });

  it('throws on unsupported MIME type (image/bmp)', () => {
    expect(() => validateToyImage(jpegBuffer(), 'image/bmp')).toThrow('Unsupported image format');
  });

  it('throws when no MIME type provided and buffer has unknown signature', () => {
    expect(() => validateToyImage(unknownBuffer())).toThrow('Unsupported image format');
  });
});

// ──────────────────────────────────────────────
// validateIdentityImageBuffer
// ──────────────────────────────────────────────
describe('validateIdentityImageBuffer', () => {
  // ── Happy path: auto-detect from signature ──
  it('detects JPEG from buffer signature without MIME', () => {
    expect(validateIdentityImageBuffer(jpegBuffer())).toBe('image/jpeg');
  });

  it('detects PNG from buffer signature without MIME', () => {
    expect(validateIdentityImageBuffer(pngBuffer())).toBe('image/png');
  });

  it('detects WebP from buffer signature without MIME', () => {
    expect(validateIdentityImageBuffer(webpBuffer())).toBe('image/webp');
  });

  it('returns correct type when MIME matches detected signature', () => {
    expect(validateIdentityImageBuffer(jpegBuffer(), 'image/jpeg')).toBe('image/jpeg');
  });

  it('accepts "image/jpg" as alias for JPEG', () => {
    expect(validateIdentityImageBuffer(jpegBuffer(), 'image/jpg')).toBe('image/jpeg');
  });

  // ── Error cases: SVG blocked ──
  it('rejects SVG by MIME type', () => {
    const fakeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(() => validateIdentityImageBuffer(fakeSvg, 'image/svg+xml')).toThrow('SVG');
  });

  it('rejects buffer containing <svg tag even without svg MIME', () => {
    const buf = Buffer.from('<svg><rect/></svg>' + '\x00'.repeat(20));
    expect(() => validateIdentityImageBuffer(buf)).toThrow();
  });

  it('rejects buffer containing <?xml tag', () => {
    const buf = Buffer.from('<?xml version="1.0"?><svg></svg>' + '\x00'.repeat(20));
    expect(() => validateIdentityImageBuffer(buf)).toThrow();
  });

  // ── Error cases: mismatch ──
  it('throws when MIME type mismatches detected signature', () => {
    expect(() => validateIdentityImageBuffer(jpegBuffer(), 'image/png')).toThrow('does not match');
  });

  // ── Error cases: unknown signature ──
  it('throws when buffer has no recognized signature', () => {
    expect(() => validateIdentityImageBuffer(unknownBuffer())).toThrow('does not match allowed signatures');
  });

  // ── Error cases: invalid buffer ──
  it('throws on buffer too small', () => {
    expect(() => validateIdentityImageBuffer(Buffer.from([0x00, 0x01]))).toThrow(AppError);
  });
});
