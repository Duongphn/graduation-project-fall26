import { describe, expect, it, vi } from 'vitest';

import { buildAuditLog } from '../../src/infrastructure/database/audit.js';
import {
  buildPrivateImageUrl,
  buildStringToSign,
  createUploadSignature,
  signCloudinaryParams,
} from '../../src/infrastructure/storage/cloudinary.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import { domainEvents } from '../../src/shared/events/domain-events.js';
import { assertTransition, type TransitionMap } from '../../src/shared/utils/transitions.js';
import { reasonSchema, vietnamPhoneSchema } from '../../src/shared/http/schemas.js';
import { ageInYears } from '../../src/shared/utils/dates.js';
import {
  duplicateKeyFields,
  duplicateKeyIndex,
  isDuplicateKeyError,
} from '../../src/shared/utils/mongo-errors.js';
import {
  maskPhone,
  normalizeVietnamPhone,
  phoneSearchDigits,
} from '../../src/shared/utils/phone.js';
import { maskEmail } from '../../src/shared/utils/privacy.js';
import { pickFreeSlug, slugify } from '../../src/shared/utils/slug.js';
import {
  accentInsensitivePattern,
  escapeRegex,
  normalizeSearchText,
  normalizeText,
} from '../../src/shared/utils/text.js';

const credentials = { cloudName: 'demo', apiKey: 'key', apiSecret: 'abcd' };

describe('text', () => {
  it.each([
    ['  Bé   Na ', 'Bé Na'],
    ['Ha\u0300 noi', 'H\u00e0 noi'],
  ])('normalizeText(%j)', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it('normalizes search text without accents', () => {
    expect(normalizeSearchText('  Đồ CHƠI   gỗ ')).toBe('do choi go');
  });

  it('builds an accent-insensitive pattern', () => {
    const pattern = new RegExp(accentInsensitivePattern('ha  noi'), 'i');
    expect(pattern.test('Thành phố Hà   Nội')).toBe(true);
    expect(pattern.test('Hải Phòng')).toBe(false);
    expect(new RegExp(accentInsensitivePattern('da nang'), 'i').test('Đà Nẵng')).toBe(true);
    expect(new RegExp(accentInsensitivePattern('a.b')).test('axb')).toBe(false);
  });

  it('escapes regex characters', () => {
    expect(escapeRegex('a+b(c)')).toBe('a\\+b\\(c\\)');
  });
});

describe('slug', () => {
  it.each([
    ['Đồ chơi gỗ!', 'do-choi-go'],
    ['  ---  ', 'item'],
    ['Xe đạp 3 bánh', 'xe-dap-3-banh'],
  ])('slugify(%j)', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('picks the first free slug', async () => {
    const taken = new Set(['lego', 'lego-2']);
    expect(await pickFreeSlug('lego', async (slug) => taken.has(slug))).toBe('lego-3');
  });
});

describe('phone and privacy', () => {
  it.each([
    ['0912 345 678', '+84912345678'],
    ['84912345678', '+84912345678'],
    ['+84912345678', '+84912345678'],
    ['012345', undefined],
    ['0012345678', undefined],
  ])('normalizeVietnamPhone(%j)', (input, expected) => {
    expect(normalizeVietnamPhone(input)).toBe(expected);
  });

  it.each([
    ['0912345678', '+8491***5678'],
    ['12', '***'],
    [null, '***'],
  ])('maskPhone(%j)', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });

  it('extracts phone search digits', () => {
    expect(phoneSearchDigits('0912345678')).toBe('912345678');
    expect(phoneSearchDigits('0912')).toBe('912');
  });

  it.each([
    ['nguyen.an@gmail.com', 'ng***@gmail.com'],
    ['a@x.vn', '***@x.vn'],
    ['bad', '***'],
    [undefined, '***'],
  ])('maskEmail(%j)', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it('validates phones and reasons', () => {
    expect(vietnamPhoneSchema.parse(' 0912345678 ')).toBe('+84912345678');
    expect(vietnamPhoneSchema.safeParse('123').success).toBe(false);
    expect(reasonSchema.safeParse('abcd').success).toBe(false);
    expect(reasonSchema.safeParse('x'.repeat(501)).success).toBe(false);
    expect(reasonSchema.parse('  Ảnh mờ  ')).toBe('Ảnh mờ');
  });
});

describe('dates', () => {
  it('counts the age on the Vietnamese calendar', () => {
    // Born 2008-10-15 in Viet Nam = 2008-10-14T17:00Z.
    const dateOfBirth = new Date('2008-10-14T17:00:00Z');
    expect(ageInYears(dateOfBirth, new Date('2026-10-14T16:59:00Z'))).toBe(17);
    expect(ageInYears(dateOfBirth, new Date('2026-10-14T17:00:00Z'))).toBe(18);
  });
});

describe('mongo errors', () => {
  it('reads the index and fields of a duplicate key error', () => {
    const error = Object.assign(
      new Error('E11000 duplicate key error collection: t index: name_unique dup key'),
      {
        code: 11000,
        keyPattern: { name: 1 },
      },
    );
    expect(isDuplicateKeyError(error)).toBe(true);
    expect(isDuplicateKeyError(error, 'name_unique')).toBe(true);
    expect(isDuplicateKeyError(error, 'slug_unique')).toBe(false);
    expect(duplicateKeyIndex(error)).toBe('name_unique');
    expect(duplicateKeyFields(error)).toEqual(['name']);
    expect(isDuplicateKeyError(new Error('x'))).toBe(false);
  });
});

describe('transitions', () => {
  it('rejects an invalid transition with a 409 AppError', () => {
    const toyTransitions: TransitionMap<'pending' | 'active' | 'hidden'> = {
      pending: ['active', 'hidden'],
      active: ['hidden'],
      hidden: ['active'],
    };
    expect(() => assertTransition(toyTransitions, 'pending', 'active')).not.toThrow();
    try {
      assertTransition(toyTransitions, 'active', 'pending');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
      expect((error as AppError).code).toBe('INVALID_STATUS_TRANSITION');
    }
  });
});

describe('cloudinary', () => {
  it('signs parameters as documented by Cloudinary', () => {
    expect(
      buildStringToSign({ timestamp: 1315060510, public_id: 'sample_image', api_key: 'x' }),
    ).toBe('public_id=sample_image&timestamp=1315060510');
    // Example from the Cloudinary documentation.
    expect(
      signCloudinaryParams(
        {
          eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
          public_id: 'sample_image',
          timestamp: 1315060510,
        },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('creates upload signatures and private links', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    const publicId = 'toyflow/identity/67098e1b34e12c001a123456/abc';
    const signature = createUploadSignature(
      { publicId, type: 'authenticated' },
      { now, credentials },
    );
    const signed = {
      allowed_formats: 'jpg,jpeg,png,webp',
      overwrite: 'false',
      public_id: publicId,
      timestamp: '1791936000',
      type: 'authenticated',
    };
    expect(signature).toMatchObject({
      timestamp: 1791936000,
      publicId,
      signature: signCloudinaryParams(signed, 'abcd'),
    });
    expect(signature?.fields).toMatchObject({ ...signed, signature: signature?.signature });
    expect(
      createUploadSignature({ publicId: 'x', type: 'upload' }, { credentials: {} }),
    ).toBeNull();

    const link = buildPrivateImageUrl(
      { publicId: 'toyflow/identity/a', format: 'jpg' },
      {
        now,
        credentials,
      },
    );
    expect(link?.expiresAt.toISOString()).toBe('2026-10-14T00:05:00.000Z');
    const url = new URL(link?.url ?? '');
    expect(url.searchParams.get('type')).toBe('authenticated');
    expect(url.searchParams.get('public_id')).toBe('toyflow/identity/a');
  });
});

describe('audit and events', () => {
  it('builds an audit document with an optional target id', () => {
    const actorId = '67098e1b34e12c001a123456';
    const log = buildAuditLog({
      actorId,
      action: 'category.reorder',
      target: { kind: 'CATEGORY' },
    });
    expect(log.actor_id?.toString()).toBe(actorId);
    expect(log.target_type).toBe('CATEGORY');
    expect(log).not.toHaveProperty('target_id');
    expect(log).not.toHaveProperty('ip_address');
  });

  it('delivers events and isolates failing handlers', async () => {
    const received = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    domainEvents.subscribe('TOY_REVIEWED', () => {
      throw new Error('mail down');
    });
    const unsubscribe = domainEvents.subscribe('TOY_REVIEWED', received);
    const event = {
      type: 'TOY_REVIEWED',
      toyId: 't',
      ownerId: 'o',
      toyTitle: 'Lego',
      decision: 'approved',
      reviewedBy: 'a',
    } as const;

    domainEvents.publish(event);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(received).toHaveBeenCalledWith(event);
    expect(error).toHaveBeenCalled();

    unsubscribe();
    domainEvents.clear();
    error.mockRestore();
  });
});
