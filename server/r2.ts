import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/webp',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const MIME_TO_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
};

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export function getR2Config(): R2Config | null {
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucketName = (process.env.R2_BUCKET_NAME || '').trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

export function isR2Configured(): boolean {
  return getR2Config() !== null;
}

function createR2Client(cfg: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

/**
 * Validates that an object key strictly belongs to the given tenant's orders or payments photo prefix.
 * Prevents cross-tenant key access or path traversal.
 */
export function isValidTenantPhotoKey(shopId: number, photoKey: string): boolean {
  if (!photoKey || typeof photoKey !== 'string') return false;
  if (photoKey.includes('..') || photoKey.startsWith('/')) return false;
  const sid = Number(shopId);
  const validOrders = photoKey.startsWith(`shops/${sid}/orders/`);
  const validPayments = photoKey.startsWith(`shops/${sid}/payments/`);
  if (!validOrders && !validPayments) return false;
  return /^shops\/\d+\/(orders|payments)\/[a-zA-Z0-9._-]+$/.test(photoKey);
}

/**
 * Generates a short-lived Presigned PUT URL for uploading a compressed order or payment proof photo
 * directly from the worker's browser to Cloudflare R2 (bypassing Vercel's 4.5MB serverless limit).
 */
export async function createOrderPhotoUploadUrl(params: {
  shopId: number;
  contentType: string;
  orderHint?: string;
  folder?: 'orders' | 'payments';
}): Promise<{ uploadUrl: string; photoKey: string; expiresInSeconds: number }> {
  const cfg = getR2Config();
  if (!cfg) {
    throw new Error('Cloudflare R2 storage is not configured on the server yet.');
  }

  const normalizedMime = (params.contentType || 'image/webp').toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalizedMime)) {
    throw new Error('Unsupported photo format. Please use WebP, JPEG, or PNG.');
  }

  const folder = params.folder === 'payments' ? 'payments' : 'orders';
  const ext = MIME_TO_EXT[normalizedMime] || 'webp';
  const safeHint = (params.orderHint || (folder === 'payments' ? 'payment' : 'order'))
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24) || (folder === 'payments' ? 'payment' : 'order');
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const photoKey = `shops/${Number(params.shopId)}/${folder}/${safeHint}-${Date.now()}-${uniqueId}.${ext}`;

  const client = createR2Client(cfg);
  const expiresInSeconds = 300; // 5 minutes to complete upload
  const command = new PutObjectCommand({
    Bucket: cfg.bucketName,
    Key: photoKey,
    ContentType: normalizedMime,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  return { uploadUrl, photoKey, expiresInSeconds };
}

/**
 * Generates a short-lived Presigned GET URL so authorized staff (Supervisors, Warehouse, Manager)
 * can view the handwritten order slip directly inside the order viewer without public bucket access.
 */
export async function createOrderPhotoViewUrl(params: {
  shopId: number;
  photoKey: string;
}): Promise<{ viewUrl: string; expiresInSeconds: number }> {
  const cfg = getR2Config();
  if (!cfg) {
    throw new Error('Cloudflare R2 storage is not configured on the server yet.');
  }

  if (!isValidTenantPhotoKey(params.shopId, params.photoKey)) {
    throw new Error('Invalid or unauthorized order photo reference.');
  }

  const client = createR2Client(cfg);
  const expiresInSeconds = 900; // 15 minutes inline viewing window
  const command = new GetObjectCommand({
    Bucket: cfg.bucketName,
    Key: params.photoKey,
  });

  const viewUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  return { viewUrl, expiresInSeconds };
}
