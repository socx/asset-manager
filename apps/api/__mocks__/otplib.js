// Stub for Jest — plain functions (no jest.fn()) to avoid shared state between
// parallel workers. Tests that need to assert on these calls should use their own
// jest.mock('otplib', factory) override (e.g. mfa.test.ts).
module.exports = {
  generateSecret: () => 'STUB_SECRET',
  generateURI: () => 'otpauth://totp/stub',
  verify: () => Promise.resolve({ valid: false }),
  generate: () => Promise.resolve('000000'),
};
