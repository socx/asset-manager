import request from 'supertest';
import crypto from 'crypto';
import argon2 from 'argon2';
import { createApp } from '../app';

jest.mock('@asset-manager/db', () => ({
  prisma: {
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    emailVerification: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    passwordResetToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    userSession: { create: jest.fn(), updateMany: jest.fn() },
    lookupItem: { findFirst: jest.fn() },
    propertyAsset: { create: jest.fn(), findMany: jest.fn() },
    valuationEntry: { createMany: jest.fn() },
    mortgageEntry: { createMany: jest.fn() },
    shareholdingEntry: { createMany: jest.fn() },
    transactionEntry: { createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../lib/email', () => ({ queueEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/audit', () => ({ createAuditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../lib/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../lib/settings', () => ({ getNumSetting: jest.fn().mockResolvedValue(5), getBoolSetting: jest.fn().mockResolvedValue(true) }));
jest.mock('../lib/jwt', () => ({ signAccessToken: jest.fn().mockReturnValue('mock-access-token'), refreshExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)), REFRESH_COOKIE_NAME: 'refresh_token', REFRESH_COOKIE_OPTIONS: {} }));

const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db') as any;
const { queueEmail: mockQueueEmail } = jest.requireMock('../lib/email') as any;

const RAW_TOKEN = 'b'.repeat(64);
const TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');

function makeNewUser() {
  return {
    id: 'user-new-1',
    email: 'newuser@example.com',
    firstName: 'New',
    lastName: 'User',
    role: 'asset_owner',
    status: 'pending_verification',
    passwordHash: '$argon2id$fakehash',
  };
}

function makeActiveUser() {
  return {
    id: 'user-active-1',
    email: 'active@example.com',
    firstName: 'Act',
    lastName: 'User',
    role: 'asset_owner',
    status: 'active',
    passwordHash: '$argon2id$fakehash',
  };
}

describe('E2E user flows', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1. register -> verify email -> login', async () => {
    const newUser = makeNewUser();

    // registration transaction
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn({ user: { create: jest.fn().mockResolvedValue(newUser) }, emailVerification: { create: jest.fn().mockResolvedValue({}) } }));

    const resReg = await request(app).post('/api/v1/auth/register').send({
      email: newUser.email,
      password: 'Str0ng!Passw0rd#',
      firstName: newUser.firstName,
      lastName: newUser.lastName,
    });

    expect(resReg.status).toBe(201);

    // verify email: mock lookup of token
    mockPrisma.emailVerification.findFirst.mockResolvedValue({ id: 'ver-1', tokenHash: TOKEN_HASH, usedAt: null, expiresAt: new Date(Date.now() + 3600000), user: newUser });
    mockPrisma.$transaction.mockResolvedValue([]);

    const resVerify = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(resVerify.status).toBe(200);

    // login: user should be active now
    mockPrisma.user.findFirst.mockResolvedValue({ ...newUser, status: 'active', passwordHash: '$argon2id$fakehash' });
    (argon2.verify as jest.Mock) = jest.fn().mockResolvedValue(true);

    const resLogin = await request(app).post('/api/v1/auth/login').send({ email: newUser.email, password: 'Str0ng!Passw0rd#' });
    expect(resLogin.status).toBe(200);
    expect(resLogin.body).toHaveProperty('accessToken');
  });

  it('2. forgot password -> reset -> login with new password', async () => {
    const user = makeActiveUser();
    mockPrisma.user.findFirst.mockResolvedValue(user);
    mockPrisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' });

    const resForgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: user.email });
    expect(resForgot.status).toBe(200);
    expect(mockQueueEmail).toHaveBeenCalled();

    // simulate token lookup during reset
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'prt-1', tokenHash: TOKEN_HASH, userId: user.id, user: user, expiresAt: new Date(Date.now() + 3600000) });
    mockPrisma.$transaction.mockResolvedValue([]);
    (argon2.hash as jest.Mock) = jest.fn().mockResolvedValue('$argon2id$newhash');

    const resReset = await request(app).post('/api/v1/auth/reset-password').send({ token: RAW_TOKEN, newPassword: 'N3wStr0ng!Pass#' });
    expect(resReset.status).toBe(200);

    // login with new password
    mockPrisma.user.findFirst.mockResolvedValue({ ...user, passwordHash: '$argon2id$newhash' });
    (argon2.verify as jest.Mock) = jest.fn().mockResolvedValue(true);

    const resLogin2 = await request(app).post('/api/v1/auth/login').send({ email: user.email, password: 'N3wStr0ng!Pass#' });
    expect(resLogin2.status).toBe(200);
    expect(resLogin2.body).toHaveProperty('accessToken');
  });

  it('3. new user registers -> no assets -> registers a property asset', async () => {
    const newUser = makeNewUser();

    // register
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.$Transaction = undefined;
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn({ user: { create: jest.fn().mockResolvedValue(newUser) }, emailVerification: { create: jest.fn().mockResolvedValue({}) } }));
    const resReg = await request(app).post('/api/v1/auth/register').send({ email: newUser.email, password: 'Str0ng!Passw0rd#', firstName: newUser.firstName, lastName: newUser.lastName });
    expect(resReg.status).toBe(201);

    // verify
    mockPrisma.emailVerification.findFirst.mockResolvedValue({ id: 'ver-2', tokenHash: TOKEN_HASH, usedAt: null, expiresAt: new Date(Date.now() + 3600000), user: newUser });
    mockPrisma.$transaction.mockResolvedValue([]);
    const resVerify = await request(app).get(`/api/v1/auth/verify-email?token=${RAW_TOKEN}`);
    expect(resVerify.status).toBe(200);

    // login
    mockPrisma.user.findFirst.mockResolvedValue({ ...newUser, status: 'active', passwordHash: '$argon2id$fakehash' });
    (argon2.verify as jest.Mock) = jest.fn().mockResolvedValue(true);
    const resLogin = await request(app).post('/api/v1/auth/login').send({ email: newUser.email, password: 'Str0ng!Passw0rd#' });
    expect(resLogin.status).toBe(200);
    const accessToken = resLogin.body.accessToken as string;
    expect(accessToken).toBeTruthy();

    // ensure auth middleware accepts the token
    const jwtMock: any = jest.requireMock('../lib/jwt');
    jwtMock.verifyAccessToken = jest.fn().mockReturnValue({ sub: newUser.id, role: newUser.role, email: newUser.email });

    // list assets -> empty
    mockPrisma.propertyAsset.findMany.mockResolvedValue([]);
    const resList = await request(app).get('/api/v1/assets/properties').set('Authorization', `Bearer ${accessToken}`);
    expect(resList.status).toBe(200);
    expect(resList.body.assets).toHaveLength(0);

    // create property asset
    mockPrisma.lookupItem.findFirst.mockResolvedValue({ id: '77777777-7777-4777-8777-777777777777' });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ code: 'PROP-00001' }]),
        propertyAsset: { create: jest.fn().mockResolvedValue({ id: 'asset-1' }), findUnique: jest.fn().mockResolvedValue({ id: 'asset-1' }) },
        valuationEntry: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        mortgageEntry: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        shareholdingEntry: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
        transactionEntry: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };
      try {
        return await fn(tx);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('TX_ERROR', e);
        throw e;
      }
    });

    const resCreate = await request(app).post('/api/v1/assets/properties').set('Authorization', `Bearer ${accessToken}`).send({
      ownershipTypeId: '77777777-7777-4777-8777-777777777777',
      addressLine1: '10 Downing St',
      city: 'London',
      postCode: 'SW1A 2AA',
      country: 'United Kingdom',
      propertyStatusId: '77777777-7777-4777-8777-777777777777',
      propertyPurposeId: '77777777-7777-4777-8777-777777777777',
    });

    if (resCreate.status !== 201) {
      // eslint-disable-next-line no-console
      console.error('create asset failed', resCreate.status, resCreate.body);
    }
    expect(resCreate.status).toBe(201);
    expect(resCreate.body.asset).toHaveProperty('id');
  });
});
