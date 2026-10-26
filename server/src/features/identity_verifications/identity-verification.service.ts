import mongoose, { type Model } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import {
  IdentityVerification,
  type IIdentityVerification,
} from './identity_verifications.model.js';
import { User, type IUser } from '../users/users.model.js';
import type {
  AdminQueueItem,
  AdminVerificationDetail,
  IdentityImageStorage,
  IdentityVerificationEvents,
  IdentityVerificationFiles,
  PaginatedResult,
  ReviewReceipt,
  StoredIdentityImage,
  VerificationStatus,
} from '../../interfaces/identity-verification.ports.js';
import {
  type SubmissionInput,
  validateSubmissionInput,
} from './identity-verification.schemas.js';

export interface SubmissionReceipt {
  id: string;
  status: VerificationStatus;
  submittedAt: Date;
}

export interface LatestVerificationDto {
  id: string;
  status: VerificationStatus;
  submittedAt: Date;
  rejectionReason: string | null;
  reviewedAt: Date | null;
}

export class IdentityVerificationService {
  public constructor(
    private readonly verificationModel: Model<IIdentityVerification> = IdentityVerification,
    private readonly userModel: Model<IUser> = User,
    private readonly imageStorage?: IdentityImageStorage,
    private readonly events?: IdentityVerificationEvents,
  ) {}

  public async submit(
    userId: string,
    rawInput: unknown,
    files: IdentityVerificationFiles,
  ): Promise<SubmissionReceipt> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    if (!files || !files.frontImage || !files.backImage || !files.selfie) {
      throw new AppError(
        400,
        'MISSING_REQUIRED_IMAGE',
        'frontImage, backImage, and selfie files are required.',
      );
    }

    if (!this.imageStorage) {
      throw new AppError(500, 'STORAGE_ERROR', 'Identity storage is not configured.');
    }

    const input: SubmissionInput = validateSubmissionInput(rawInput);

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
    }

    if (user.verificationStatus === 'verified') {
      throw new AppError(
        409,
        'ALREADY_VERIFIED',
        'User is already verified and cannot submit identity verification.',
      );
    }

    const userObjId = new mongoose.Types.ObjectId(userId);
    const existingPending = await this.verificationModel.findOne({
      userId: userObjId,
      status: 'pending',
    });

    if (existingPending) {
      throw new AppError(
        409,
        'VERIFICATION_ALREADY_PENDING',
        'A verification submission is already pending review.',
      );
    }

    const uploadedImages: StoredIdentityImage[] = [];
    let frontImage: StoredIdentityImage;
    let backImage: StoredIdentityImage;
    let selfie: StoredIdentityImage;

    try {
      [frontImage, backImage, selfie] = await Promise.all([
        this.imageStorage.upload(files.frontImage.buffer, files.frontImage.mimetype),
        this.imageStorage.upload(files.backImage.buffer, files.backImage.mimetype),
        this.imageStorage.upload(files.selfie.buffer, files.selfie.mimetype),
      ]);
      uploadedImages.push(frontImage, backImage, selfie);
    } catch (uploadError) {
      if (uploadedImages.length > 0) {
        await this.imageStorage.delete(uploadedImages).catch(() => {});
      }
      throw new AppError(
        500,
        'STORAGE_ERROR',
        uploadError instanceof Error ? uploadError.message : 'Failed to upload identity verification images.',
      );
    }

    let verificationDoc: IIdentityVerification;
    try {
      const doc = new this.verificationModel({
        userId: userObjId,
        phone: input.phone,
        idCardNumber: input.idCardNumber,
        frontImage,
        backImage,
        selfie,
        status: 'pending',
        submittedAt: new Date(),
      });
      await doc.save();
      verificationDoc = doc;
    } catch (saveError: unknown) {
      if (this.imageStorage) {
        await this.imageStorage.delete(uploadedImages).catch(() => {});
      }
      if (
        typeof saveError === 'object' &&
        saveError !== null &&
        'code' in saveError &&
        (saveError as { code: unknown }).code === 11000
      ) {
        throw new AppError(
          409,
          'VERIFICATION_ALREADY_PENDING',
          'A verification submission is already pending review.',
        );
      }
      throw saveError;
    }

    user.verificationStatus = 'pending';
    await user.save();

    return {
      id: verificationDoc._id.toString(),
      status: verificationDoc.status as VerificationStatus,
      submittedAt: verificationDoc.submittedAt,
    };
  }

  public async getLatest(userId: string): Promise<LatestVerificationDto | null> {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, 'INVALID_USER_ID', 'Invalid user ID.');
    }

    const userObjId = new mongoose.Types.ObjectId(userId);
    const doc = await this.verificationModel
      .findOne({ userId: userObjId })
      .sort({ submittedAt: -1 });

    if (!doc) {
      return null;
    }

    return {
      id: doc._id.toString(),
      status: doc.status as VerificationStatus,
      submittedAt: doc.submittedAt,
      rejectionReason: doc.rejectionReason ?? null,
      reviewedAt: doc.reviewedAt ?? null,
    };
  }

  public async listQueue(query: {
    page?: number;
    limit?: number;
    status?: VerificationStatus;
  }): Promise<PaginatedResult<AdminQueueItem>> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
    const status = query.status || 'pending';

    const filter = { status };
    const total = await this.verificationModel.countDocuments(filter);
    const docs = await this.verificationModel
      .find(filter)
      .sort({ submittedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const userIds = docs.map((d) => d.userId);
    const users = await this.userModel.find({ _id: { $in: userIds } });
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const items: AdminQueueItem[] = docs.map((d) => {
      const u = userMap.get(d.userId.toString());
      return {
        id: d._id.toString(),
        userId: d.userId.toString(),
        fullName: u?.fullName ?? '',
        email: u?.email ?? '',
        phone: d.phone,
        idCardNumber: d.idCardNumber,
        status: d.status as VerificationStatus,
        submittedAt: d.submittedAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public async getAdminDetail(verificationId: string): Promise<AdminVerificationDetail> {
    if (!verificationId || !mongoose.Types.ObjectId.isValid(verificationId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid verification ID.');
    }

    const doc = await this.verificationModel.findById(verificationId);
    if (!doc) {
      throw new AppError(404, 'NOT_FOUND', 'Verification submission not found.');
    }

    if (!this.imageStorage) {
      throw new AppError(500, 'STORAGE_ERROR', 'Identity storage is not configured.');
    }

    const user = await this.userModel.findById(doc.userId);

    const [frontImage, backImage, selfie] = await Promise.all([
      this.imageStorage.getAuthorizedDelivery(doc.frontImage.publicId),
      this.imageStorage.getAuthorizedDelivery(doc.backImage.publicId),
      this.imageStorage.getAuthorizedDelivery(doc.selfie.publicId),
    ]);

    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      user: {
        fullName: user?.fullName ?? '',
        email: user?.email ?? '',
        phone: user?.phone ?? '',
      },
      phone: doc.phone,
      idCardNumber: doc.idCardNumber,
      frontImage,
      backImage,
      selfie,
      status: doc.status as VerificationStatus,
      rejectionReason: doc.rejectionReason ?? null,
      submittedAt: doc.submittedAt,
      reviewedBy: doc.reviewedBy ? doc.reviewedBy.toString() : null,
      reviewedAt: doc.reviewedAt ?? null,
    };
  }

  public async review(
    adminId: string,
    verificationId: string,
    input: { action: 'approve' | 'reject'; rejectionReason?: string },
  ): Promise<ReviewReceipt> {
    if (!adminId || !mongoose.Types.ObjectId.isValid(adminId)) {
      throw new AppError(400, 'INVALID_ADMIN_ID', 'Invalid admin ID.');
    }
    if (!verificationId || !mongoose.Types.ObjectId.isValid(verificationId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid verification ID.');
    }

    if (!input || (input.action !== 'approve' && input.action !== 'reject')) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Action must be "approve" or "reject".');
    }

    if (input.action === 'reject') {
      if (
        !input.rejectionReason ||
        typeof input.rejectionReason !== 'string' ||
        input.rejectionReason.trim().length === 0
      ) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Rejection reason is required when rejecting a submission.',
        );
      }
    }

    const targetStatus: VerificationStatus = input.action === 'approve' ? 'verified' : 'rejected';

    const updatedDoc = await this.verificationModel.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(verificationId),
        status: 'pending',
      },
      {
        status: targetStatus,
        rejectionReason:
          input.action === 'reject' && input.rejectionReason
            ? input.rejectionReason.trim()
            : undefined,
        reviewedBy: new mongoose.Types.ObjectId(adminId),
        reviewedAt: new Date(),
      },
      { new: true },
    );

    if (!updatedDoc) {
      const existing = await this.verificationModel.findById(verificationId);
      if (!existing) {
        throw new AppError(404, 'NOT_FOUND', 'Verification submission not found.');
      }
      throw new AppError(
        409,
        'SUBMISSION_NOT_PENDING',
        'Only pending verification submissions can be reviewed.',
      );
    }

    const user = await this.userModel.findById(updatedDoc.userId);
    if (user) {
      user.verificationStatus = targetStatus;
      if (input.action === 'approve') {
        user.idCardNumber = updatedDoc.idCardNumber;
      }
      await user.save();
    }

    if (this.events) {
      await this.events
        .publishStatusChanged(
          updatedDoc.userId.toString(),
          targetStatus,
          input.action === 'reject' && input.rejectionReason ? input.rejectionReason.trim() : undefined,
        )
        .catch(() => {});
    }

    const receipt: ReviewReceipt = {
      id: updatedDoc._id.toString(),
      status: targetStatus,
      reviewedAt: updatedDoc.reviewedAt!,
      reviewedBy: adminId,
    };
    if (updatedDoc.rejectionReason) {
      receipt.rejectionReason = updatedDoc.rejectionReason;
    }

    return receipt;
  }
}
