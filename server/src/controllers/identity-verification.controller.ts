import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import type { IdentityVerificationService } from '../services/identity-verification.service.js';
import type {
  IdentityVerificationFiles,
  VerificationStatus,
} from '../interfaces/identity-verification.ports.js';

export class IdentityVerificationController {
  public constructor(private readonly service: IdentityVerificationService) {}

  public submit: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      if (
        !files ||
        !files.frontImage?.[0] ||
        !files.backImage?.[0] ||
        !files.selfie?.[0]
      ) {
        throw new AppError(
          400,
          'MISSING_REQUIRED_IMAGE',
          'frontImage, backImage, and selfie are required files.',
        );
      }

      const submissionFiles: IdentityVerificationFiles = {
        frontImage: {
          buffer: files.frontImage[0].buffer,
          mimetype: files.frontImage[0].mimetype,
          originalname: files.frontImage[0].originalname,
          size: files.frontImage[0].size,
        },
        backImage: {
          buffer: files.backImage[0].buffer,
          mimetype: files.backImage[0].mimetype,
          originalname: files.backImage[0].originalname,
          size: files.backImage[0].size,
        },
        selfie: {
          buffer: files.selfie[0].buffer,
          mimetype: files.selfie[0].mimetype,
          originalname: files.selfie[0].originalname,
          size: files.selfie[0].size,
        },
      };

      const receipt = await this.service.submit(req.auth.userId, req.body, submissionFiles);
      res.status(201).json({ success: true, data: receipt });
    } catch (error) {
      next(error);
    }
  };

  public getLatest: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const data = await this.service.getLatest(req.auth.userId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public listQueue: RequestHandler = async (req, res, next) => {
    try {
      const pageStr = req.query.page as string | undefined;
      const limitStr = req.query.limit as string | undefined;
      const status = req.query.status as VerificationStatus | undefined;

      const queryObj: { page?: number; limit?: number; status?: VerificationStatus } = {};
      if (pageStr) {
        queryObj.page = parseInt(pageStr, 10);
      }
      if (limitStr) {
        queryObj.limit = parseInt(limitStr, 10);
      }
      if (status) {
        queryObj.status = status;
      }

      const data = await this.service.listQueue(queryObj);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public getAdminDetail: RequestHandler = async (req, res, next) => {
    try {
      const id = typeof req.params.id === 'string' ? req.params.id : '';
      const data = await this.service.getAdminDetail(id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  public review: RequestHandler = async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }
      const id = typeof req.params.id === 'string' ? req.params.id : '';
      const receipt = await this.service.review(req.auth.userId, id, req.body);
      res.status(200).json({ success: true, data: receipt });
    } catch (error) {
      next(error);
    }
  };
}
