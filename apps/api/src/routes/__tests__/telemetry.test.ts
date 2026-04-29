import request from 'supertest';
import { createApp } from '../../app';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../../lib/redis', () => ({
  redis: {
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    zadd:             jest.fn().mockResolvedValue(1),
    expire:           jest.fn().mockResolvedValue(1),
    multi: jest.fn().mockReturnValue({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd:             jest.fn().mockReturnThis(),
      expire:           jest.fn().mockReturnThis(),
      exec:             jest.fn().mockResolvedValue([]),
    }),
  },
}));

// ── Mock references ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redis: mockRedis } = jest.requireMock('../../lib/redis') as {
  redis: { multi: jest.Mock };
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/telemetry/pageview', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-configure multi to return a fresh chain each time
    const chain = {
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd:             jest.fn().mockReturnThis(),
      expire:           jest.fn().mockReturnThis(),
      exec:             jest.fn().mockResolvedValue([]),
    };
    mockRedis.multi.mockReturnValue(chain);
  });

  it('returns 204 with a valid path', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry/pageview')
      .send({ path: '/admin/users', sessionId: 'abc-def-123' });

    expect(res.status).toBe(204);
  });

  it('returns 204 without sessionId (falls back to IP)', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry/pageview')
      .send({ path: '/' });

    expect(res.status).toBe(204);
  });

  it('returns 400 if path does not start with /', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry/pageview')
      .send({ path: 'admin/users' });

    expect(res.status).toBe(400);
  });

  it('returns 400 if path is missing', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry/pageview')
      .send({ sessionId: 'abc' });

    expect(res.status).toBe(400);
  });

  it('returns 400 if path exceeds 500 characters', async () => {
    const res = await request(app)
      .post('/api/v1/telemetry/pageview')
      .send({ path: '/' + 'a'.repeat(500) });

    expect(res.status).toBe(400);
  });
});
