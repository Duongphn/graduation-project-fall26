import type { NextFunction, Request, Response } from 'express';
import { type TrustReviewService } from '../services/trust-review.service.js';
import { getAdminContext } from '../utils/admin-context.js';
import {
  validateTrustDecisionInput,
  validateTrustQueueQuery,
} from '../validations/trust-review.validation.js';

export class TrustReviewController {
  public constructor(private readonly service: TrustReviewService) {}

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.list(validateTrustQueueQuery(req.query));
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public detail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.detail(req.params.userId as string);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public decide = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = validateTrustDecisionInput(req.body);
      const data = await this.service.decide(
        getAdminContext(req),
        req.params.userId as string,
        input,
      );
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
