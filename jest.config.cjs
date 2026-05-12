/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/apps/api/jest.config.cjs',
    '<rootDir>/apps/worker/jest.config.cjs',
  ],
  testPathIgnorePatterns: ['<rootDir>/apps/web/'],
};
