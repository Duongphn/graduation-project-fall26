import type { RequestHandler } from 'express';
import type { WalletService } from '../services/wallet.service.js';
import { AppError } from '../utils/app-error.js';
import {
  validateSystemWalletParam,
  validateTransactionListQuery,
} from '../validations/wallet.validation.js';

export class WalletController {
  public constructor(private readonly walletService: WalletService) {}

  public getMyWallet: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const data = await this.walletService.getMyWallet(req.auth.userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public getMyTransactions: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const query = validateTransactionListQuery(req.query);
      const data = await this.walletService.getMyTransactions(req.auth.userId, query);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public getSystemWallet: RequestHandler = async (req, res, next) => {
    try {
      const { ownerType } = validateSystemWalletParam(req.params);
      const data = await this.walletService.getSystemWallet(ownerType);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
