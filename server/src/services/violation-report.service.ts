import { Types } from 'mongoose';

import {
  REPORT_DAILY_LIMIT,
  REPORT_LIMIT_WINDOW_MS,
  UNSAFE_REASON,
} from '../constants/violation-report.js';
import * as repository from '../repositories/violation-report.repository.js';
import { AppError } from '../utils/app-error.js';
import { conflict, notFound, unprocessable } from '../utils/http-errors.js';
import { isDuplicateKeyError } from '../utils/mongo-errors.js';
import {
  REPORT_EVIDENCE_PATTERN,
  type CreatedReport,
  type CreateReportBody,
} from '../validations/violation-report.validation.js';

// UC28 Report Violation: a signed-in User reports a toy post, a user or a message with a reason,
// a description and optional photos. The report waits (pending) for an Admin (UC29).

const alreadyReported = () =>
  conflict(
    'REPORT_ALREADY_PENDING',
    'Bạn đã báo cáo nội dung này và báo cáo vẫn đang chờ Admin xử lý.',
  );

/** The user who owns the reported item; refuses what cannot be reported. */
const resolveTarget = async (
  reporterId: string,
  body: CreateReportBody,
): Promise<Types.ObjectId> => {
  if (body.targetKind === 'toy') {
    const toy = await repository.findToy(body.targetId);
    // R03 II.7.3 precondition: the listing is Active.
    if (!toy || toy.status !== 'active') {
      throw notFound('REPORT_TARGET_NOT_FOUND', 'Không tìm thấy tin đăng để báo cáo.');
    }
    if (String(toy.ownerId) === reporterId) {
      throw unprocessable('CANNOT_REPORT_SELF', 'Bạn không thể báo cáo tin đăng của chính mình.');
    }
    return toy.ownerId;
  }

  if (body.targetKind === 'user') {
    const user = await repository.findUser(body.targetId);
    if (!user || user.role !== 'USER') {
      throw notFound('REPORT_TARGET_NOT_FOUND', 'Không tìm thấy người dùng để báo cáo.');
    }
    if (String(user._id) === reporterId) {
      throw unprocessable('CANNOT_REPORT_SELF', 'Bạn không thể báo cáo chính mình.');
    }
    return user._id;
  }

  // A message: only a member of the conversation can report it, and not their own message.
  const message = await repository.findMessage(body.targetId);
  if (!message || !(await repository.isConversationParticipant(message.conversationId, reporterId))) {
    throw notFound('REPORT_TARGET_NOT_FOUND', 'Không tìm thấy tin nhắn để báo cáo.');
  }
  if (String(message.senderId) === reporterId) {
    throw unprocessable('CANNOT_REPORT_SELF', 'Bạn không thể báo cáo tin nhắn của chính mình.');
  }
  return message.senderId;
};

export const createReport = async (
  reporterId: string,
  body: CreateReportBody,
  now: Date = new Date(),
): Promise<CreatedReport> => {
  // Evidence photos must be the reporter's own uploads.
  for (const photo of body.evidence ?? []) {
    if (REPORT_EVIDENCE_PATTERN.exec(photo.publicId)?.[1] !== reporterId) {
      throw unprocessable('EVIDENCE_NOT_OWNED', 'Ảnh bằng chứng phải do chính bạn tải lên.');
    }
  }

  // GB-37: one open report per reporter and target.
  if (await repository.hasPendingReport(reporterId, body.targetKind, body.targetId)) {
    throw alreadyReported();
  }

  // Spam guard (R03 III.6.3.1 (3)).
  const recent = await repository.countReportsSince(
    reporterId,
    new Date(now.getTime() - REPORT_LIMIT_WINDOW_MS),
  );
  if (recent >= REPORT_DAILY_LIMIT) {
    throw new AppError(
      429,
      'REPORT_RATE_LIMITED',
      `Bạn đã gửi ${REPORT_DAILY_LIMIT} báo cáo trong 24 giờ qua. Vui lòng thử lại sau.`,
    );
  }

  const ownerId = await resolveTarget(reporterId, body);

  try {
    const report = await repository.insertReport({
      reporterId: new Types.ObjectId(reporterId),
      target: { kind: body.targetKind, id: new Types.ObjectId(body.targetId), userId: ownerId },
      reason: body.reason,
      isUnsafe: body.reason === UNSAFE_REASON,
      ...(body.unsafeIssues?.length ? { unsafeIssues: body.unsafeIssues } : {}),
      description: body.description,
      ...(body.evidence?.length ? { evidence: body.evidence } : {}),
      status: 'pending',
    });
    return {
      id: String(report._id),
      targetKind: report.target.kind,
      targetId: String(report.target.id),
      reason: report.reason,
      status: 'pending',
      createdAt: report.createdAt.toISOString(),
    };
  } catch (error) {
    // Two reports sent at the same time: the partial unique index keeps one.
    if (isDuplicateKeyError(error, 'one_pending_per_reporter_and_target')) throw alreadyReported();
    throw error;
  }
};
