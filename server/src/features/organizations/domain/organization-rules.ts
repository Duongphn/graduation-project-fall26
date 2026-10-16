import { env } from '../../../config/env.js';
import type { VisibilityStatus } from '../../../shared/domain/statuses.js';
import { escapeRegex } from '../../../shared/utils/text.js';

/** ACTIVE (Donors can choose it) <-> HIDDEN. Created as ACTIVE: the Admin has checked it. */
export const organizationTransitions: Readonly<
  Record<VisibilityStatus, readonly VisibilityStatus[]>
> = {
  ACTIVE: ['HIDDEN'],
  HIDDEN: ['ACTIVE'],
};

/** Folder of the ORGANIZATION_LOGO upload purpose (features/uploads/uploads.schemas.ts). */
export const ORGANIZATION_LOGO_FOLDER = 'toyflow/organizations';

/**
 * True only for the secure_url of an image uploaded with a signed ORGANIZATION_LOGO upload:
 * https://res.cloudinary.com/<our cloud>/image/upload/[transformations/][v123/]toyflow/organizations/...
 * Any other host, cloud or folder is refused, so the page never loads a third-party image.
 */
export const isOrganizationLogoUrl = (
  value: string,
  cloudName: string | undefined = env.cloudinary.cloudName,
): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return false;
  if (url.search || url.hash || url.username || url.password) return false;
  const cloud = cloudName ? escapeRegex(cloudName) : '[^/]+';
  const folder = escapeRegex(ORGANIZATION_LOGO_FOLDER);
  return new RegExp(`^/${cloud}/image/upload/(?:[^/]+/)*?(?:v[0-9]+/)?${folder}/[^/]+$`).test(
    url.pathname,
  );
};
