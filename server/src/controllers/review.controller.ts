import type { NextFunction, Request, Response } from 'express';
import { type ReviewService } from '../services/review.service.js';
import { validateReviewListQuery } from '../validations/review.validation.js';

export class ReviewController {
  public constructor(private readonly service: ReviewService) {}

  /** The body is validated by the service, after it knows the caller is a party of the order. */
  public submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.submitRentalReview(
        req.auth!,
        req.params.id as string,
        req.body,
      );
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.getRentalReviews(req.auth!, req.params.id as string);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public listForToy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = validateReviewListQuery(req.query);
      const data = await this.service.listToyReviews(req.params.id as string, query);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public listForUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = validateReviewListQuery(req.query);
      const data = await this.service.listUserReviews(req.params.id as string, query);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
