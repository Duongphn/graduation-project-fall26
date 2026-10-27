import type { NextFunction, Request, Response } from 'express';
import { type WalletService } from '../services/wallet.service.js';
import {
  validateAdminCreditInput,
  validateWalletPaginationQuery,
} from '../validations/wallet.validation.js';

export class WalletController {
  public constructor(private readonly service: WalletService) {}

  public getMyWallet = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const pagination = validateWalletPaginationQuery(req.query);
      const data = await this.service.getMyWallet(req.auth!, pagination);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  public adminCredit = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const input = validateAdminCreditInput(req.body);
      const userId = req.params.userId as string;
      const data = await this.service.adminCredit(req.auth!, userId, input);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
