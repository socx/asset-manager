/**
 * Storage provider abstraction layer
 * Supports local filesystem and S3 backends with unified interface
 */
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export interface StorageProvider {
  uploadFile(buffer: Buffer, filename: string): Promise<string>;
  downloadFile(storagePath: string): Promise<Buffer>;
  deleteFile(storagePath: string): Promise<void>;
  fileExists(storagePath: string): Promise<boolean>;
}

/**
 * Local filesystem storage provider
 * Stores files in the local filesystem under STORAGE_LOCAL_PATH
 */
export class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || path.join(process.cwd(), 'uploads', 'documents');
    this.ensureDirectory(this.basePath);
  }

  private ensureDirectory(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      logger.warn('[storage] failed to ensure directory', { err, dir });
    }
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    // Use UUID-based storage path (opaque, prevents path traversal)
    const ext = path.extname(filename);
    const storagePath = `${uuidv4()}${ext}`;
    const filePath = path.join(this.basePath, storagePath);

    try {
      fs.writeFileSync(filePath, buffer);
      return filePath;
    } catch (err) {
      logger.error('[storage:local] upload failed', { err, filePath });
      throw new Error('Failed to upload file');
    }
  }

  async downloadFile(storagePath: string): Promise<Buffer> {
    try {
      return fs.readFileSync(storagePath);
    } catch (err) {
      logger.error('[storage:local] download failed', { err, storagePath });
      throw new Error('Failed to download file');
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
    } catch (err) {
      logger.error('[storage:local] delete failed', { err, storagePath });
      throw new Error('Failed to delete file');
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    return fs.existsSync(storagePath);
  }
}

/**
 * S3 storage provider
 * Stores files in AWS S3 with unified interface
 */
export class S3StorageProvider implements StorageProvider {
  private bucketName: string;
  private region: string;
  // S3 client will be initialized lazily when needed
  private s3Client: any;

  constructor(bucketName: string, region: string, accessKeyId: string, secretAccessKey: string) {
    this.bucketName = bucketName;
    this.region = region;

    // Initialize S3 client - AWS SDK v3 is optional dependency
    try {
      const { S3Client } = require('@aws-sdk/client-s3');
      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
    } catch (err) {
      logger.warn('[storage:s3] AWS SDK not available, S3 storage disabled', { err });
    }
  }

  async uploadFile(buffer: Buffer, filename: string): Promise<string> {
    if (!this.s3Client) {
      throw new Error('S3 storage not configured');
    }

    // Use UUID-based storage path (opaque, prevents path traversal)
    const ext = path.extname(filename);
    const key = `${uuidv4()}${ext}`;

    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
        })
      );
      return `s3://${this.bucketName}/${key}`;
    } catch (err) {
      logger.error('[storage:s3] upload failed', { err, key });
      throw new Error('Failed to upload file to S3');
    }
  }

  async downloadFile(storagePath: string): Promise<Buffer> {
    if (!this.s3Client) {
      throw new Error('S3 storage not configured');
    }

    const key = this.extractS3Key(storagePath);

    try {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (err) {
      logger.error('[storage:s3] download failed', { err, key });
      throw new Error('Failed to download file from S3');
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    if (!this.s3Client) {
      throw new Error('S3 storage not configured');
    }

    const key = this.extractS3Key(storagePath);

    try {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );
    } catch (err) {
      logger.error('[storage:s3] delete failed', { err, key });
      throw new Error('Failed to delete file from S3');
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    if (!this.s3Client) {
      throw new Error('S3 storage not configured');
    }

    const key = this.extractS3Key(storagePath);

    try {
      const { HeadObjectCommand } = require('@aws-sdk/client-s3');
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );
      return true;
    } catch (err: any) {
      if (err.name === 'NotFound') {
        return false;
      }
      logger.error('[storage:s3] fileExists check failed', { err, key });
      return false;
    }
  }

  private extractS3Key(storagePath: string): string {
    // storagePath format: s3://bucket/key or key
    if (storagePath.startsWith('s3://')) {
      return storagePath.replace(`s3://${this.bucketName}/`, '');
    }
    return storagePath;
  }
}

/**
 * Get storage provider based on environment configuration
 */
export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || 'local';

  if (provider === 's3') {
    return new S3StorageProvider(
      process.env.S3_BUCKET || '',
      process.env.S3_REGION || '',
      process.env.S3_ACCESS_KEY_ID || '',
      process.env.S3_SECRET_ACCESS_KEY || ''
    );
  }

  return new LocalStorageProvider(process.env.STORAGE_LOCAL_PATH);
}

// Export singleton instance
export const storageProvider = getStorageProvider();
