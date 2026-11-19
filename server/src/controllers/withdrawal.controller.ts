import type { NextFunction, Request, Response } from 'express';
import { getValidatedQuery } from '../middlewares/validate.js';
import type { WithdrawalService } from '../services/withdrawal.service.js';
import { sendSuccess } from '../utils/response.js';
import type { WithdrawalBody, WithdrawalListQuery } from '../validations/wallet.validation.js';

/** UC18: POST /wallets/withdrawals, GET /wallets/withdrawals */
export class WithdrawalController {
  public constructor(private readonly service: WithdrawalService) {}

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await this.service.requestWithdrawal(req.auth!, req.body as WithdrawalBody);
      sendSuccess(res, data, {
        status: 201,
        message: 'Tạo yêu cầu rút tiền thành công. Số dư ví đã được tạm giữ để xử lý.',
      });
    } catch (err) {
      next(err);
    }
  };

  public listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = getValidatedQuery<WithdrawalListQuery>(res);
      sendSuccess(res, await this.service.listMyWithdrawals(req.auth!, query));
    } catch (err) {
      next(err);
    }
  };
}
