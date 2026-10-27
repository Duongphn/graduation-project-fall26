import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import type { RequestActorType } from '../types/request-actor.js';
import '../types/request-actor.js';
import { AppError } from '../utils/app-error.js';

/**
 * Middleware yêu cầu người dùng phải đăng nhập (Bất kể vai trò USER hay ADMIN)
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (
    !req.auth ||
    !req.auth.userId ||
    typeof req.auth.userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(req.auth.userId)
  ) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
  }

  next();
};

/**
 * Middleware phân quyền dựa trên danh sách vai trò cho phép (Role-based Authorization)
 * @param allowedRoles Danh sách vai trò được phép (VD: requireRoles('ADMIN'), requireRoles('USER', 'ADMIN'))
 */
export const requireRoles = (...allowedRoles: RequestActorType[]): RequestHandler => {
  return (req, _res, next) => {
    if (
      !req.auth ||
      !req.auth.userId ||
      typeof req.auth.userId !== 'string' ||
      !mongoose.Types.ObjectId.isValid(req.auth.userId)
    ) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
    }

    if (!allowedRoles.includes(req.auth.actorType)) {
      return next(
        new AppError(
          403,
          'FORBIDDEN',
          `Access forbidden. Required role: ${allowedRoles.join(' or ')}.`,
        ),
      );
    }

    next();
  };
};

/**
 * Middleware yêu cầu vai trò thành viên (USER)
 */
export const requireUser: RequestHandler = requireRoles('USER');

/**
 * Middleware chỉ cho phép Khách (Guest - chưa đăng nhập)
 * Thường dùng cho các route như Đăng ký, Đăng nhập (nếu đã đăng nhập thì không cần vào lại)
 */
export const requireGuest: RequestHandler = (req, _res, next) => {
  if (req.auth && req.auth.userId) {
    return next(
      new AppError(403, 'FORBIDDEN', 'Access forbidden for already authenticated users.'),
    );
  }

  next();
};
