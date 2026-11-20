import { describe, expect, it } from 'vitest';
import { getOpenApiDocument } from '../src/config/openapi.js';
import '../src/routes/index.js';

describe('OpenAPI document: reviews and trust score', () => {
  it('lists the seven review and trust-review operations', () => {
    const paths = getOpenApiDocument().paths ?? {};
    const has = (path: string, method: string) =>
      Object.prototype.hasOwnProperty.call(paths[path] ?? {}, method);
    expect(has('/api/v1/rentals/{id}/reviews', 'post')).toBe(true);
    expect(has('/api/v1/rentals/{id}/reviews', 'get')).toBe(true);
    expect(has('/api/v1/toys/{id}/reviews', 'get')).toBe(true);
    expect(has('/api/v1/users/{id}/reviews', 'get')).toBe(true);
    expect(has('/api/v1/admin/trust-reviews', 'get')).toBe(true);
    expect(has('/api/v1/admin/trust-reviews/{userId}', 'get')).toBe(true);
    expect(has('/api/v1/admin/trust-reviews/{userId}/decision', 'post')).toBe(true);
  });
});
