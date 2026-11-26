import type { Request, Response } from 'express';

import { getValidatedBody, getValidatedParams } from '../middlewares/validate.js';
import * as admin from '../services/system-setting-admin.service.js';
import { SystemSettingService } from '../services/system-setting.service.js';
import { getAdminContext } from '../utils/admin-context.js';
import { sendSuccess } from '../utils/response.js';
import type {
  ResetSettingBody,
  SettingKeyParams,
  UpdateSettingBody,
} from '../validations/system-setting.validation.js';

const settingKey = (response: Response): string =>
  getValidatedParams<SettingKeyParams>(response).key;

// GET /api/v1/admin/settings
export const list = async (_request: Request, response: Response): Promise<void> => {
  sendSuccess(response, await admin.listSettings());
};

// GET /api/v1/admin/settings/:key
export const detail = async (_request: Request, response: Response): Promise<void> => {
  sendSuccess(response, await admin.getSetting(settingKey(response)));
};

// PATCH /api/v1/admin/settings/:key
export const update = async (request: Request, response: Response): Promise<void> => {
  const setting = await admin.updateSetting(
    settingKey(response),
    getValidatedBody<UpdateSettingBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, setting, {
    message: 'Đã lưu cấu hình. Giá trị mới áp dụng cho giao dịch tạo từ bây giờ.',
  });
};

// POST /api/v1/admin/settings/:key/reset
export const reset = async (request: Request, response: Response): Promise<void> => {
  const setting = await admin.resetSetting(
    settingKey(response),
    getValidatedBody<ResetSettingBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, setting, {
    message: 'Đã đặt lại giá trị mặc định. Giá trị này áp dụng cho giao dịch tạo từ bây giờ.',
  });
};

const settings = new SystemSettingService();

// GET /api/v1/settings/public
export const publicSettings = async (_request: Request, response: Response): Promise<void> => {
  sendSuccess(response, await settings.getPublicSettings());
};
