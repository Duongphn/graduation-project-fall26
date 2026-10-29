import { jsonContent, openApiRegistry } from '../config/openapi.js';
import { z } from '../validations/zod.js';

const healthSchema = z
  .object({
    status: z.literal('ok'),
    service: z.string().openapi({ example: 'toyflow-backend' }),
  })
  .openapi('HealthStatus');

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/health',
  tags: ['Health'],
  summary: 'Liveness check (no auth, no envelope)',
  responses: { 200: { description: 'The API is up', content: jsonContent(healthSchema) } },
});
