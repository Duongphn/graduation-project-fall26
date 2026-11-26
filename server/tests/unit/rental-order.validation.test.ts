import { describe, expect, it } from 'vitest';
import { validateRentalListQuery } from '../../src/validations/rental-order.validation.js';
import { AppError } from '../../src/utils/app-error.js';

describe('validateRentalListQuery', () => {
  describe('defaults and pagination', () => {
    it('defaults role to renter, page to 1, and limit to 10 when empty query passed', () => {
      const res = validateRentalListQuery({});
      expect(res.role).toBe('renter');
      expect(res.page).toBe(1);
      expect(res.limit).toBe(10);
      expect(res.status).toBeUndefined();
    });

    it('parses custom page and limit within bounds', () => {
      const res = validateRentalListQuery({ page: '3', limit: '25' });
      expect(res.page).toBe(3);
      expect(res.limit).toBe(25);
    });

    it('rejects invalid page or limit values', () => {
      expect(() => validateRentalListQuery({ page: 0 })).toThrow(AppError);
      expect(() => validateRentalListQuery({ page: -1 })).toThrow(AppError);
      expect(() => validateRentalListQuery({ page: 'abc' })).toThrow(AppError);
      expect(() => validateRentalListQuery({ limit: 0 })).toThrow(AppError);
      expect(() => validateRentalListQuery({ limit: 101 })).toThrow(AppError);
      expect(() => validateRentalListQuery({ limit: 'invalid' })).toThrow(AppError);
    });
  });

  describe('role validation and admin privileges', () => {
    it('accepts role="renter" for regular user', () => {
      const res = validateRentalListQuery({ role: 'renter' }, 'user');
      expect(res.role).toBe('renter');
    });

    it('accepts role="owner" for regular user', () => {
      const res = validateRentalListQuery({ role: 'owner' }, 'user');
      expect(res.role).toBe('owner');
    });

    it('allows role="all" when caller is admin (case-insensitive)', () => {
      const resAdmin = validateRentalListQuery({ role: 'all' }, 'admin');
      expect(resAdmin.role).toBe('all');

      const resAdminUpper = validateRentalListQuery({ role: 'all' }, 'ADMIN');
      expect(resAdminUpper.role).toBe('all');
    });

    it('rejects role="all" with 403 FORBIDDEN_RENTAL_ACTION for non-admin or unauthenticated callers', () => {
      try {
        validateRentalListQuery({ role: 'all' }, 'user');
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(403);
        expect(appErr.code).toBe('FORBIDDEN_RENTAL_ACTION');
      }

      try {
        validateRentalListQuery({ role: 'all' });
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(403);
        expect(appErr.code).toBe('FORBIDDEN_RENTAL_ACTION');
      }
    });

    it('rejects unrecognized role values with 400', () => {
      expect(() => validateRentalListQuery({ role: 'guest' })).toThrow(AppError);
      expect(() => validateRentalListQuery({ role: 123 })).toThrow(AppError);
    });
  });

  describe('status parsing', () => {
    it('parses single status string', () => {
      const res = validateRentalListQuery({ status: 'PENDING' });
      expect(res.status).toEqual(['PENDING']);
    });

    it('parses comma-separated status strings', () => {
      const res = validateRentalListQuery({ status: 'PENDING,ACCEPTED' });
      expect(res.status).toEqual(['PENDING', 'ACCEPTED']);
    });

    it('trims whitespace and handles status arrays', () => {
      const res = validateRentalListQuery({ status: ' PENDING , ACCEPTED ' });
      expect(res.status).toEqual(['PENDING', 'ACCEPTED']);

      const resArr = validateRentalListQuery({ status: ['PENDING', 'PAID'] });
      expect(resArr.status).toEqual(['PENDING', 'PAID']);
    });

    it('rejects invalid status values', () => {
      expect(() => validateRentalListQuery({ status: 'UNKNOWN_STATUS' })).toThrow(AppError);
      expect(() => validateRentalListQuery({ status: 'PENDING,INVALID' })).toThrow(AppError);
      expect(() => validateRentalListQuery({ status: 123 })).toThrow(AppError);
    });
  });

  describe('group resolution and conflict checking', () => {
    it('resolves group="active" into active statuses array', () => {
      const res = validateRentalListQuery({ group: 'active' });
      expect(res.status).toEqual(['ACCEPTED', 'PAID', 'SHIPPING', 'IN_USE', 'RETURNING']);
    });

    it('resolves group="pending" into ["PENDING"]', () => {
      const res = validateRentalListQuery({ group: 'pending' });
      expect(res.status).toEqual(['PENDING']);
    });

    it('resolves group="completed" into ["COMPLETED"]', () => {
      const res = validateRentalListQuery({ group: 'completed' });
      expect(res.status).toEqual(['COMPLETED']);
    });

    it('resolves group="cancelled" into ["CANCELLED", "REJECTED", "EXPIRED"]', () => {
      const res = validateRentalListQuery({ group: 'cancelled' });
      expect(res.status).toEqual(['CANCELLED', 'REJECTED', 'EXPIRED']);
    });

    it('resolves group="disputed" into ["DISPUTING"]', () => {
      const res = validateRentalListQuery({ group: 'disputed' });
      expect(res.status).toEqual(['DISPUTING']);
    });

    it('resolves group="all" into all rental order statuses', () => {
      const res = validateRentalListQuery({ group: 'all' });
      expect(res.status).toEqual([
        'PENDING',
        'ACCEPTED',
        'PAID',
        'SHIPPING',
        'IN_USE',
        'RETURNING',
        'COMPLETED',
        'REJECTED',
        'CANCELLED',
        'EXPIRED',
        'DISPUTING',
      ]);
    });

    it('rejects invalid group names', () => {
      expect(() => validateRentalListQuery({ group: 'invalid_group' })).toThrow(AppError);
    });

    it('filters status when both group and status are provided and compatible', () => {
      const res = validateRentalListQuery({ group: 'active', status: 'ACCEPTED,RETURNING' });
      expect(res.status).toEqual(['ACCEPTED', 'RETURNING']);
    });

    it('rejects conflicting group and status when intersection is empty', () => {
      try {
        validateRentalListQuery({ group: 'pending', status: 'COMPLETED' });
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe('VALIDATION_ERROR');
        expect(appErr.message).toBe('Trạng thái và nhóm trạng thái mâu thuẫn.');
      }
    });
  });

  describe('invalid query input', () => {
    it('throws VALIDATION_ERROR for non-object queries', () => {
      expect(() => validateRentalListQuery(null)).toThrow(AppError);
      expect(() => validateRentalListQuery('query')).toThrow(AppError);
      expect(() => validateRentalListQuery(123)).toThrow(AppError);
    });
  });
});
