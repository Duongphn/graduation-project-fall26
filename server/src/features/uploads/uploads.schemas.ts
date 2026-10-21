import { z } from '../../shared/validation/zod.js';

/**
 * What an image is for. Each purpose maps to one Cloudinary folder and delivery type, so a
 * client can never pick a folder or make a private document public.
 */
export const uploadPurposes = {
  TOY_PHOTO: { folder: 'toyflow/toys', type: 'upload' },
  AVATAR: { folder: 'toyflow/avatars', type: 'upload' },
  IDENTITY_DOCUMENT: { folder: 'toyflow/identity', type: 'authenticated' },
  HANDOVER_PHOTO: { folder: 'toyflow/handovers', type: 'authenticated' },
  DISPUTE_EVIDENCE: { folder: 'toyflow/disputes', type: 'authenticated' },
} as const;

export type UploadPurpose = keyof typeof uploadPurposes;

const purposeValues = Object.keys(uploadPurposes) as [UploadPurpose, ...UploadPurpose[]];

export const uploadSignatureBodySchema = z
  .object({ purpose: z.enum(purposeValues) })
  .strict()
  .openapi('UploadSignatureRequest');
export type UploadSignatureBody = z.infer<typeof uploadSignatureBodySchema>;

export const uploadSignatureSchema = z
  .object({
    uploadUrl: z.string().openapi({ description: 'POST the file here as multipart/form-data.' }),
    cloudName: z.string(),
    apiKey: z.string(),
    timestamp: z.number().int(),
    publicId: z.string().openapi({
      description: 'Chosen by the server: <purpose folder>/<uploader id>/<random>.',
      example: 'toyflow/handovers/67098e1b34e12c001a123456/9f86d081884c7d659a2feaa0',
    }),
    type: z.enum(['upload', 'authenticated']),
    allowedFormats: z.string().openapi({ example: 'jpg,jpeg,png,webp' }),
    signature: z.string(),
    fields: z.record(z.string(), z.string()).openapi({
      description:
        'Send every entry as a multipart field, plus `file`. Signed: changing one is refused.',
    }),
    maxFileBytes: z.number().int().openapi({ description: 'Checked by the client.' }),
  })
  .openapi('UploadSignature');
