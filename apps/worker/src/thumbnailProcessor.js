const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { prisma } = require('@asset-manager/db');

async function processThumbnailJob(data) {
  if (!data || !data.documentId || !data.filePath) {
    throw new Error('Invalid job data');
  }

  if (!data.mimeType || !data.mimeType.startsWith('image/')) {
    return;
  }

  const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'documents');
  const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbnails');
  try { fs.mkdirSync(THUMB_DIR, { recursive: true }); } catch {}

  const storedFilename = path.basename(data.storageKey);
  const thumbFilename = `thumb-${storedFilename.replace(/\.[^.]+$/, '')}.jpg`;
  const thumbPath = path.join(THUMB_DIR, thumbFilename);
  // tuned thumbnail: slightly smaller and lower quality to save space
  await sharp(data.filePath).resize({ width: 400 }).jpeg({ quality: 75 }).toFile(thumbPath);

  // Generate a tiny blurred LQIP (base64) for UI placeholders
  const lqipBuffer = await sharp(data.filePath)
    .resize({ width: 20 })
    .blur(1)
    .jpeg({ quality: 30 })
    .toBuffer();
  const lqipBase64 = `data:image/jpeg;base64,${lqipBuffer.toString('base64')}`;

  const thumbnailKey = `uploads/documents/thumbnails/${thumbFilename}`;

  await prisma.document.update({
    where: { id: data.documentId },
    data: { metadata: { thumbnailKey, thumbnailLqip: lqipBase64 } },
  });
}

module.exports = { processThumbnailJob };
