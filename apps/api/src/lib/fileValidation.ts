/**
 * File validation utilities
 * - Magic bytes verification (not just MIME type)
 * - File type white-listing
 */

const ALLOWED_MIME_TYPES_LIST = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES_LIST)[number];

/**
 * Magic bytes (file signatures) for allowed file types
 * Maps MIME type to Buffer pattern
 */
const MAGIC_BYTES: Record<AllowedMimeType, Buffer[]> = {
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
  'image/jpeg': [
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // JPEG with JFIF
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]), // JPEG with EXIF
    Buffer.from([0xff, 0xd8, 0xff, 0xe8]), // JPEG with SPIFF
  ],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47])], // PNG
};

/**
 * Verify file magic bytes match declared MIME type
 * Returns true if valid, false otherwise
 */
export function verifyFileMagic(buffer: Buffer, mimeType: string): boolean {
  const patterns = MAGIC_BYTES[mimeType as AllowedMimeType];
  if (!patterns) {
    return false; // MIME type not in whitelist
  }

  // Check if buffer starts with any of the magic byte patterns
  return patterns.some((pattern: Buffer) =>
    pattern.every((byte: number, idx: number) => buffer[idx] === byte)
  );
}

/**
 * Validate file: check MIME type and magic bytes
 * Throws error if invalid
 */
export function validateFile(buffer: Buffer, declaredMimeType: string): void {
  if (!ALLOWED_MIME_TYPES_LIST.includes(declaredMimeType as AllowedMimeType)) {
    throw new Error(`File type not allowed: ${declaredMimeType}`);
  }

  if (!verifyFileMagic(buffer, declaredMimeType)) {
    throw new Error(`File content does not match declared type: ${declaredMimeType}`);
  }
}

/**
 * Check if MIME type is allowed
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES_LIST.includes(mimeType as AllowedMimeType);
}

/**
 * Get list of allowed MIME types
 */
export function getAllowedMimeTypes(): readonly string[] {
  return ALLOWED_MIME_TYPES_LIST;
}
