import type { RequestHandler } from 'express';

import type { AddressService } from '../services/address.service.js';
import { AppError } from '../utils/app-error.js';
import {
  addressIdParamsSchema,
  createAddressSchema,
  updateAddressSchema,
} from '../validations/address.validation.js';

const actorId = (auth: { userId?: string } | undefined): string => {
  if (!auth?.userId) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
  }
  return auth.userId;
};

/** /users/addresses: sổ địa chỉ của người đang đăng nhập */
export class AddressController {
  public constructor(private readonly service: AddressService) {}

  public list: RequestHandler = async (req, res, next) => {
    try {
      const data = await this.service.list(actorId(req.auth));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public create: RequestHandler = async (req, res, next) => {
    try {
      const userId = actorId(req.auth);
      const data = await this.service.create(userId, createAddressSchema.parse(req.body));
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public update: RequestHandler = async (req, res, next) => {
    try {
      const userId = actorId(req.auth);
      const { addressId } = addressIdParamsSchema.parse(req.params);
      const data = await this.service.update(userId, addressId, updateAddressSchema.parse(req.body));
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public remove: RequestHandler = async (req, res, next) => {
    try {
      const userId = actorId(req.auth);
      const { addressId } = addressIdParamsSchema.parse(req.params);
      await this.service.remove(userId, addressId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
