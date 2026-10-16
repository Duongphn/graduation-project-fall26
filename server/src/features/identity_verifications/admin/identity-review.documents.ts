import {
  buildPrivateImageUrl,
  type CloudinaryCredentials,
} from '../../../infrastructure/storage/cloudinary.js';
import type { VerificationStatus } from '../../../shared/domain/statuses.js';

// Signed, 5-minute links to the three private images of a verification (R04 III.1.3, GB-35).
// Links are built only while the request is PENDING; there is never a fallback to a stored or
// public URL.

export const documentKeys = ['frontImage', 'backImage', 'selfieImage'] as const;
export type DocumentKey = (typeof documentKeys)[number];

interface PrivateImage {
  publicId: string;
  format: string;
}

export type DocumentLinks = Record<DocumentKey, { url: string; expiresAt: string } | null>;

export interface SignedDocuments {
  documents: DocumentLinks;
  previewAvailable: boolean;
  previewExpiresAt: string | null;
}

const noLinks: DocumentLinks = { frontImage: null, backImage: null, selfieImage: null };

export const signDocuments = (
  verification: { status: VerificationStatus } & Record<DocumentKey, PrivateImage>,
  options: { now?: Date; credentials?: CloudinaryCredentials } = {},
): SignedDocuments => {
  if (verification.status !== 'PENDING') {
    return { documents: noLinks, previewAvailable: false, previewExpiresAt: null };
  }

  const documents = { ...noLinks };
  let earliest: Date | null = null;
  for (const key of documentKeys) {
    const signed = buildPrivateImageUrl(verification[key], options);
    if (!signed) continue;
    documents[key] = { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
    if (!earliest || signed.expiresAt < earliest) earliest = signed.expiresAt;
  }

  const previewAvailable = documentKeys.every((key) => documents[key] !== null);
  return {
    documents,
    previewAvailable,
    previewExpiresAt: earliest ? earliest.toISOString() : null,
  };
};

/** The keys that received a link, for the audit log. */
export const signedKeys = (documents: DocumentLinks): DocumentKey[] =>
  documentKeys.filter((key) => documents[key] !== null);
