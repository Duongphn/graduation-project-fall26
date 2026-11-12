import type { NextFunction, Request, Response } from 'express';

import { getValidatedBody } from '../middlewares/validate.js';
import type { AiAssistanceService } from '../services/ai-assistance.service.js';
import { getRequestUserId } from '../utils/admin-context.js';
import { sendSuccess } from '../utils/response.js';
import type { AdvisorAskBody } from '../validations/ai-advisor.validation.js';

/** R04 3.4: POST /ai/toy-advice → AiAssistanceService.getToyAdvice → ToyAdviceDTO. */
export class AiAssistanceController {
  public constructor(private readonly service: AiAssistanceService) {}

  /** Chạy trước cả xác thực: trợ lý đang tắt thì mọi lượt gọi đều nhận 503 (US-08). */
  public ensureEnabled = (_req: Request, _res: Response, next: NextFunction): void => {
    next(this.service.isEnabled ? undefined : this.service.disabledError());
  };

  public getToyAdvice = async (req: Request, res: Response): Promise<void> => {
    const body = getValidatedBody<AdvisorAskBody>(req);
    const advice = await this.service.getToyAdvice({
      userId: getRequestUserId(req),
      message: body.message,
      filters: body.filters,
      history: body.history,
      filtersFromButtons: body.filtersFromButtons,
    });
    sendSuccess(res, advice);
  };
}
