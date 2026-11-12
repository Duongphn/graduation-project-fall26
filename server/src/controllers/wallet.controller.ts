import type { RequestHandler } from 'express';
import type { WalletService } from '../services/wallet.service.js';
import { AppError } from '../utils/app-error.js';
import {
  validateSystemWalletParam,
  validateTransactionListQuery,
  validateWithdrawalRequest,
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

  public requestWithdrawal: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const input = validateWithdrawalRequest(req.body);
      const data = await this.walletService.requestWithdrawal(req.auth.userId, input);
      res.status(201).json({
        success: true,
        message: 'Tạo yêu cầu rút tiền thành công. Số dư ví đã được tạm giữ để xử lý.',
        data,
      });
    } catch (error) {
      next(error);
    }
  };

  public getMyWithdrawals: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const page = req.query.page ? Number.parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? Number.parseInt(req.query.limit as string, 10) : 20;
      const data = await this.walletService.getMyWithdrawals(req.auth.userId, { page, limit });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}

