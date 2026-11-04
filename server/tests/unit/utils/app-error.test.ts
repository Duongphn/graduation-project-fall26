import { describe, expect, it } from 'vitest';

import { AppError } from '../../../src/utils/app-error.js';

describe('AppError', () => {
  it('creates an error with all properties', () => {
    const error = new AppError(404, 'NOT_FOUND', 'Resource not found', { id: '123' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Resource not found');
    expect(error.details).toEqual({ id: '123' });
  });

  it('creates an error without optional details', () => {
    const error = new AppError(400, 'BAD_REQUEST', 'Invalid input');

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Invalid input');
    expect(error.details).toBeUndefined();
  });

  it('is catchable as a standard Error', () => {
    const error = new AppError(500, 'INTERNAL', 'Something went wrong');

    expect(() => {
      throw error;
    }).toThrow(Error);
  });

  it('has a proper stack trace', () => {
    const error = new AppError(401, 'UNAUTHORIZED', 'Auth required');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('AppError');
  });

  it('preserves common HTTP status codes', () => {
    const cases = [
      { status: 400, code: 'BAD_REQUEST' },
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 403, code: 'FORBIDDEN' },
      { status: 404, code: 'NOT_FOUND' },
      { status: 409, code: 'CONFLICT' },
      { status: 422, code: 'UNPROCESSABLE' },
      { status: 500, code: 'INTERNAL' },
    ];

    for (const { status, code } of cases) {
      const error = new AppError(status, code, 'test');
      expect(error.statusCode).toBe(status);
      expect(error.code).toBe(code);
    }
  });
});
