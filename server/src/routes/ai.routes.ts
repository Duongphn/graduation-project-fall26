import { Router } from 'express';

import { AiAssistanceController } from '../controllers/ai-assistance.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { validateRequest } from '../middlewares/validate.js';
import type { AiAssistanceService } from '../services/ai-assistance.service.js';
import { advisorAskBodySchema } from '../validations/ai-advisor.validation.js';
import './ai.openapi.js';

/** Mounted at /api/v1/ai. Thứ tự: cờ tính năng → xác thực → validate đầu vào. */
export function createAiRouter(service: AiAssistanceService): Router {
  const router = Router();
  const controller = new AiAssistanceController(service);

  router.post(
    '/toy-advice',
    controller.ensureEnabled,
    authenticate,
    requireActor,
    validateRequest({ body: advisorAskBodySchema }),
    controller.getToyAdvice,
  );

  return router;
}
