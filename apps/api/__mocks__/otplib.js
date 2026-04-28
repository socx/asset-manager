// Stub for Jest — used by non-MFA tests that don't need real TOTP functionality.
// mfa.test.ts overrides this via jest.mock('otplib', () => { ... }).
module.exports = {
  generateSecret: jest.fn().mockReturnValue('STUB_SECRET'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/stub'),
  verify: jest.fn().mockResolvedValue({ valid: false }),
  generate: jest.fn().mockResolvedValue('000000'),
};
