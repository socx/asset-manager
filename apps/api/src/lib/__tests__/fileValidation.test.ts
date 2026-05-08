import { verifyFileMagic, validateFile, isAllowedMimeType, getAllowedMimeTypes } from '../../lib/fileValidation';

describe('File validation', () => {
  describe('verifyFileMagic', () => {
    test('detects valid PDF magic bytes', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // %PDF-1
      expect(verifyFileMagic(pdfBuffer, 'application/pdf')).toBe(true);
    });

    test('detects valid PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG header
      expect(verifyFileMagic(pngBuffer, 'image/png')).toBe(true);
    });

    test('detects valid JPEG magic bytes (JFIF)', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG JFIF
      expect(verifyFileMagic(jpegBuffer, 'image/jpeg')).toBe(true);
    });

    test('detects valid JPEG magic bytes (EXIF)', () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10]); // JPEG EXIF
      expect(verifyFileMagic(jpegBuffer, 'image/jpeg')).toBe(true);
    });

    test('rejects mismatched magic bytes', () => {
      const fakeBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]); // Invalid header
      expect(verifyFileMagic(fakeBuffer, 'application/pdf')).toBe(false);
    });

    test('rejects unsupported MIME types', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // Valid JPEG header
      expect(verifyFileMagic(buffer, 'application/json')).toBe(false);
    });

    test('rejects PNG magic bytes as JPEG', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // Valid PNG header
      expect(verifyFileMagic(pngBuffer, 'image/jpeg')).toBe(false);
    });
  });

  describe('validateFile', () => {
    test('validates correct PDF file', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      expect(() => validateFile(pdfBuffer, 'application/pdf')).not.toThrow();
    });

    test('throws when MIME type not allowed', () => {
      const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      expect(() => validateFile(buffer, 'application/json')).toThrow(
        'File type not allowed'
      );
    });

    test('throws when magic bytes do not match MIME type', () => {
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      expect(() => validateFile(buffer, 'image/jpeg')).toThrow(
        'File content does not match declared type'
      );
    });

    test('throws on completely invalid file header', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(() => validateFile(buffer, 'application/pdf')).toThrow(
        'File content does not match declared type'
      );
    });
  });

  describe('isAllowedMimeType', () => {
    test('allows PDF MIME type', () => {
      expect(isAllowedMimeType('application/pdf')).toBe(true);
    });

    test('allows JPEG MIME type', () => {
      expect(isAllowedMimeType('image/jpeg')).toBe(true);
    });

    test('allows PNG MIME type', () => {
      expect(isAllowedMimeType('image/png')).toBe(true);
    });

    test('rejects JSON MIME type', () => {
      expect(isAllowedMimeType('application/json')).toBe(false);
    });

    test('rejects GIF MIME type', () => {
      expect(isAllowedMimeType('image/gif')).toBe(false);
    });

    test('rejects unknown MIME type', () => {
      expect(isAllowedMimeType('application/unknown')).toBe(false);
    });
  });

  describe('getAllowedMimeTypes', () => {
    test('returns array of allowed MIME types', () => {
      const allowed = getAllowedMimeTypes();
      expect(Array.isArray(allowed)).toBe(true);
      expect(allowed.length).toBeGreaterThan(0);
      expect(allowed).toContain('application/pdf');
      expect(allowed).toContain('image/jpeg');
      expect(allowed).toContain('image/png');
    });
  });
});
