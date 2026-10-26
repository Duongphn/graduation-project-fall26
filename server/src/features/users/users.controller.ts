import type { RequestHandler } from 'express';
import { AppError } from '../../utils/app-error.js';
import type { UsersService } from './users.service.js';

export class UsersController {
  public constructor(private readonly service: UsersService) {}

  public getProfile: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const data = await this.service.getProfile(req.auth.userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public updateProfile: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const data = await this.service.updateProfile(req.auth.userId, req.body);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public uploadAvatar: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      if (!req.file) {
        throw new AppError(400, 'MISSING_REQUIRED_IMAGE', 'Avatar file is required.');
      }
      const data = await this.service.uploadAvatar(req.auth.userId, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
        size: req.file.size,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };
}
