import { Router } from 'express';

import { AiAdvisorController } from '../controllers/ai-advisor.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { validateRequest } from '../middlewares/validate.js';
import type { AiAdvisorService } from '../services/ai-advisor.service.js';
import { advisorAskBodySchema } from '../validations/ai-advisor.validation.js';
import './ai.openapi.js';

/** Mounted at /api/v1/ai. Thứ tự: cờ tính năng → xác thực → validate đầu vào. */
export function createAiRouter(service: AiAdvisorService): Router {
  const router = Router();
  const controller = new AiAdvisorController(service);

  router.post(
    '/advisor',
    controller.ensureEnabled,
    authenticate,
    requireActor,
    validateRequest({ body: advisorAskBodySchema }),
    controller.ask,
  );

  return router;
}
