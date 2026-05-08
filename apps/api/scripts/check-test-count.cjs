const fs = require('node:fs');
const path = require('node:path');

const resultsPath = path.resolve(__dirname, '../coverage/jest-results.json');
const baseline = Number(process.env.ITER3_API_TEST_BASELINE ?? 298);

if (!Number.isFinite(baseline) || baseline < 0) {
  console.error(`[iter-4-006] Invalid ITER3_API_TEST_BASELINE: ${process.env.ITER3_API_TEST_BASELINE}`);
  process.exit(1);
}

if (!fs.existsSync(resultsPath)) {
  console.error(`[iter-4-006] Missing Jest results file: ${resultsPath}`);
  console.error('[iter-4-006] Run `npm run test:coverage:ci --workspace=apps/api` before this guard.');
  process.exit(1);
}

const raw = fs.readFileSync(resultsPath, 'utf8');
const parsed = JSON.parse(raw);
const total = Number(parsed.numTotalTests ?? 0);

if (total < baseline) {
  console.error(`[iter-4-006] API test count regression: ${total} < baseline ${baseline}`);
  process.exit(1);
}

console.log(`[iter-4-006] API test count OK: ${total} >= baseline ${baseline}`);
