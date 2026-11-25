import type { NextFunction, Request, Response } from 'express';
import { getValidatedParams, getValidatedQuery } from '../middlewares/validate.js';
import type { WithdrawalService } from '../services/withdrawal.service.js';
import { getAdminContext } from '../utils/admin-context.js';
import { sendSuccess } from '../utils/response.js';
import type {
  AdminProcessWithdrawalBody,
  AdminWithdrawalListQuery,
  WithdrawalBody,
  WithdrawalIdParams,
  WithdrawalListQuery,
} from '../validations/wallet.validation.js';

/**
 * UC18: POST /wallets/withdrawals, GET /wallets/withdrawals.
 * Admin process withdrawal (same paths as the lead's API): GET /wallets/admin/withdrawals,
 * GET /wallets/admin/withdrawals/counts, PATCH /wallets/admin/withdrawals/:id/process.
 */
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

  public adminList = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      sendSuccess(res, await this.service.listForAdmin(getValidatedQuery<AdminWithdrawalListQuery>(res)));
    } catch (err) {
      next(err);
    }
  };

  public adminCounts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      sendSuccess(res, await this.service.countsForAdmin());
    } catch (err) {
      next(err);
    }
  };

  public adminProcess = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = getValidatedParams<WithdrawalIdParams>(res);
      const input = req.body as AdminProcessWithdrawalBody;
      const data = await this.service.processByAdmin(getAdminContext(req), id, input);
      sendSuccess(res, data, {
        message:
          data.status === 'rejected'
            ? 'Từ chối yêu cầu rút tiền và hoàn lại số dư cho người dùng thành công.'
            : 'Xác nhận hoàn tất chuyển tiền cho người dùng thành công.',
      });
    } catch (err) {
      next(err);
    }
  };
}
