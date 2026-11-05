import type { NextFunction, Request, Response } from 'express';

import { getValidatedBody } from '../middlewares/validate.js';
import type { AiAdvisorService } from '../services/ai-advisor.service.js';
import { getRequestUserId } from '../utils/admin-context.js';
import { sendSuccess } from '../utils/response.js';
import type { AdvisorAskBody } from '../validations/ai-advisor.validation.js';

export class AiAdvisorController {
  public constructor(private readonly service: AiAdvisorService) {}

  /** Chạy trước cả xác thực: trợ lý đang tắt thì mọi lượt gọi đều nhận 503 (US-08). */
  public ensureEnabled = (_req: Request, _res: Response, next: NextFunction): void => {
    next(this.service.isEnabled ? undefined : this.service.disabledError());
  };

  public ask = async (req: Request, res: Response): Promise<void> => {
    const body = getValidatedBody<AdvisorAskBody>(req);
    const reply = await this.service.ask({
      userId: getRequestUserId(req),
      message: body.message,
      filters: body.filters,
      history: body.history,
      filtersFromButtons: body.filtersFromButtons,
    });
    sendSuccess(res, reply);
  };
}
