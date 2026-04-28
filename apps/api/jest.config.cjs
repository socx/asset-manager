/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  passWithNoTests: true,
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  // otplib and its deps ship as ESM which Jest (CommonJS mode) cannot load.
  // The stub in __mocks__/otplib.js is used by all tests that do NOT explicitly
  // call jest.mock('otplib', factory). mfa.test.ts overrides it with its own factory.
  moduleNameMapper: {
    '^otplib$': '<rootDir>/__mocks__/otplib.js',
  },
};
