import { z } from 'zod';
import { AppError } from '../utils/app-error.js';

// Vietnamese mobile numbers: 10 digits starting with 03, 05, 07, 08, 09 or international +84/84
const VN_PHONE_REGEX = /^(0|84|\+84)(3|5|7|8|9)[0-9]{8}$/;
// Vietnam CMND (9 digits) or CCCD (12 digits)
const VN_IDCARD_REGEX = /^[0-9]{9}$|^[0-9]{12}$/;

export const submissionInputSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(VN_PHONE_REGEX, 'Số điện thoại không đúng định dạng Việt Nam.'),
  idCardNumber: z
    .string()
    .trim()
    .regex(VN_IDCARD_REGEX, 'Số CCCD/CMND phải gồm 9 hoặc 12 chữ số.'),
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

export function validateSubmissionInput(input: unknown): SubmissionInput {
  const result = submissionInputSchema.safeParse(input);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    const firstErrorMessage =
      Object.values(fieldErrors).flat()[0] || 'Dữ liệu xác thực không hợp lệ.';
    throw new AppError(400, 'VALIDATION_ERROR', firstErrorMessage, fieldErrors);
  }
  return result.data;
}
