import axios from "axios";

import type { UploadPurpose } from "../constants/domain";
import { apiPost } from "./http";

// Signed direct upload to Cloudinary: the backend signs one upload to a server-chosen public id
// (POST /uploads/signature), then the browser sends the file with the signed fields to Cloudinary.

interface UploadSignature {
  uploadUrl: string;
  cloudName: string;
  publicId: string;
  allowedFormats: string;
  maxFileBytes: number;
  fields: Record<string, string>;
}

export class UploadTooLargeError extends Error {
  readonly maxFileBytes: number;

  constructor(maxFileBytes: number) {
    super(`Ảnh vượt quá ${Math.round(maxFileBytes / 1024 / 1024)} MB.`);
    this.maxFileBytes = maxFileBytes;
  }
}

interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  format: string;
  width?: number;
  height?: number;
}

// What the backend expects: `url` for public images, `{ publicId, format }` for private ones.
export interface UploadedImage {
  publicId: string;
  url: string;
  format: string;
  width?: number;
  height?: number;
}

export const getUploadSignature = (purpose: UploadPurpose) =>
  apiPost<UploadSignature>("/uploads/signature", { purpose });

export const uploadImage = async (
  file: Blob,
  purpose: UploadPurpose,
  onProgress?: (percent: number) => void,
): Promise<UploadedImage> => {
  const signature = await getUploadSignature(purpose);
  if (file.size > signature.maxFileBytes)
    throw new UploadTooLargeError(signature.maxFileBytes);
  const form = new FormData();
  form.append("file", file);
  for (const [name, value] of Object.entries(signature.fields))
    form.append(name, value);

  // Plain axios, not the API client: Cloudinary must not receive our headers.
  const { data } = await axios.post<CloudinaryUploadResponse>(
    signature.uploadUrl,
    form,
    {
      onUploadProgress: (event) =>
        onProgress?.(
          event.total ? Math.round((event.loaded / event.total) * 100) : 0,
        ),
    },
  );
  return {
    publicId: data.public_id,
    url: data.secure_url,
    format: data.format,
    width: data.width,
    height: data.height,
  };
};
