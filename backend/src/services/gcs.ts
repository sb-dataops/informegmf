import { Storage, type Bucket } from "@google-cloud/storage";
import { config } from "../config.js";

let cachedStorage: Storage | null = null;

export function getStorage(): Storage {
  if (!cachedStorage) {
    cachedStorage = new Storage();
  }
  return cachedStorage;
}

function normalizeBucketName(value: string): string {
  return value
    .trim()
    .replace(/^gs:\/\//, "")
    .replace(/^https?:\/\/storage.googleapis.com\//, "")
    .replace(/^https?:\/\/console\.cloud\.google\.com\/storage\/browser\//, "")
    .replace(/^buckets\//, "")
    .replace(/\?.*$/, "")
    .replace(/\/.*$/, "");
}

function isLikelyJson(value: string): boolean {
  const trimmed = value.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

export function validateBucketSecret(rawBucketName: string): string {
  if (isLikelyJson(rawBucketName)) {
    throw new Error(
      "GCS_BUCKET_NAME está mal configurado: actualmente contiene un JSON de credenciales y debe contener únicamente el nombre del bucket (por ejemplo: mi-bucket-documentos).",
    );
  }

  const bucketName = normalizeBucketName(rawBucketName);

  if (!bucketName) {
    throw new Error("GCS_BUCKET_NAME está vacío después de normalizarse");
  }

  if (!/^[a-z0-9._-]+$/.test(bucketName)) {
    throw new Error(`GCS_BUCKET_NAME no es válido: ${bucketName}`);
  }

  return bucketName;
}

export function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function getBucket(): Bucket {
  const bucketName = validateBucketSecret(config.gcsBucketName);
  return getStorage().bucket(bucketName);
}

export function getBucketName(): string {
  return validateBucketSecret(config.gcsBucketName);
}
