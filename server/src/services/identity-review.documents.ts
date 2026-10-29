import type {
  IdentityImageStorage,
  StoredIdentityImage,
  VerificationStatus,
} from '../interfaces/identity-verification.ports.js';

// Time-limited links to the three private images of a verification, through develop's
// IdentityImageStorage.getAuthorizedDelivery. Links are built only while the request is
// pending; there is never a fallback to a stored or public URL.

export const documentKeys = ['frontImage', 'backImage', 'selfie'] as const;
export type DocumentKey = (typeof documentKeys)[number];

export type DocumentLinks = Record<DocumentKey, { url: string; expiresAt: string } | null>;

export interface SignedDocuments {
  documents: DocumentLinks;
  previewAvailable: boolean;
  previewExpiresAt: string | null;
}

let storage: IdentityImageStorage | null | undefined;

/** The storage used for document links; null (no links) until container.ts sets one. */
export const getReviewStorage = (): IdentityImageStorage | null => storage ?? null;

/**
 * Sets the storage used for document links: container.ts passes develop's Cloudinary identity
 * storage when Cloudinary is configured (else null); tests pass a fake.
 */
export const setReviewStorage = (next: IdentityImageStorage | null | undefined): void => {
  storage = next;
};

const noLinks = (): DocumentLinks => ({ frontImage: null, backImage: null, selfie: null });

export const signDocuments = async (
  verification: { status: VerificationStatus } & Record<DocumentKey, StoredIdentityImage>,
): Promise<SignedDocuments> => {
  const imageStorage = getReviewStorage();
  if (verification.status !== 'pending' || !imageStorage) {
    return { documents: noLinks(), previewAvailable: false, previewExpiresAt: null };
  }

  const documents = noLinks();
  let earliest: Date | null = null;
  for (const key of documentKeys) {
    const publicId = verification[key]?.publicId;
    if (!publicId) continue;
    const link = await imageStorage.getAuthorizedDelivery(publicId);
    documents[key] = { url: link.url, expiresAt: link.expiresAt.toISOString() };
    if (!earliest || link.expiresAt < earliest) earliest = link.expiresAt;
  }

  return {
    documents,
    previewAvailable: documentKeys.every((key) => documents[key] !== null),
    previewExpiresAt: earliest ? earliest.toISOString() : null,
  };
};

/** The keys that received a link, for the audit log. */
export const signedKeys = (documents: DocumentLinks): DocumentKey[] =>
  documentKeys.filter((key) => documents[key] !== null);
