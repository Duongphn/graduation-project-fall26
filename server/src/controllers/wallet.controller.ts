import type { NextFunction, Request, Response } from 'express';
import { getValidatedQuery } from '../middlewares/validate.js';
import { type WalletService } from '../services/wallet.service.js';
import { getAdminContext } from '../utils/admin-context.js';
import { sendSuccess } from '../utils/response.js';
import {
  validateAdminCreditInput,
  validateWalletPaginationQuery,
  type WalletTransactionListQuery,
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

  public listMyTransactions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const query = getValidatedQuery<WalletTransactionListQuery>(res);
      // { success, data: { items, total, page, limit, totalPages, hasNextPage, hasPrevPage } } như API của lead
      sendSuccess(res, await this.service.listMyTransactions(req.auth!, query));
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
      const data = await this.service.adminCredit(getAdminContext(req), userId, input);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}
