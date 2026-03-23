import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
dotenv.config();

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'comicvault';

// Upload a file buffer to R2
export async function uploadToR2(key, buffer, contentType = 'image/webp') {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

// Generate a presigned URL for reading (valid for 1 hour)
export async function getPresignedUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2, command, { expiresIn });
}

// Generate presigned URLs for multiple keys
export async function getPresignedUrls(keys, expiresIn = 3600) {
  return Promise.all(
    keys.map(async (key) => ({
      key,
      url: await getPresignedUrl(key, expiresIn),
    }))
  );
}

// Delete an object from R2
export async function deleteFromR2(key) {
  await r2.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}

export default r2;
