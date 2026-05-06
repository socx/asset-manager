import request from 'supertest';
import { Prisma } from '@prisma/client';
import { createApp } from '../../app';

jest.mock('@asset-manager/db', () => ({
  prisma: {
    lookupItem: {
      findFirst: jest.fn(),
    },
    propertyAsset: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    valuationEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    mortgageEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    shareholdingEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
    transactionEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../lib/audit', () => ({
  createAuditLog: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../lib/jwt', () => ({
  signAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  verifyAccessToken: jest.fn(),
  refreshExpiryDate: jest.fn().mockReturnValue(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
  REFRESH_COOKIE_NAME: 'refresh_token',
  REFRESH_COOKIE_OPTIONS: {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    maxAge: 604800000,
    path: '/api/v1/auth',
  },
}));

jest.mock('../../lib/redis', () => ({
  redis: {
    multi: jest.fn(() => ({
      zremrangebyscore: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
    get: jest.fn().mockResolvedValue('1'),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = jest.requireMock('@asset-manager/db');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { verifyAccessToken: mockVerifyAccessToken } = jest.requireMock('../../lib/jwt');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAuditLog: mockCreateAuditLog } = jest.requireMock('../../lib/audit');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const MANAGER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';
const ASSET_ID = '55555555-5555-4555-8555-555555555555';
const ENTRY_ID = '66666666-6666-4666-8666-666666666666';
const LOOKUP_ID = '77777777-7777-4777-8777-777777777777';
const COMPANY_ID = '88888888-8888-4888-8888-888888888888';

const AUTH = 'Bearer valid-token';

function makeTokenPayload(overrides = {}) {
  return {
    sub: OWNER_ID,
    email: 'owner@example.com',
    role: 'asset_owner',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 900,
    ...overrides,
  };
}

function makeAccessibleAsset(overrides = {}) {
  return {
    id: ASSET_ID,
    ownerId: OWNER_ID,
    managedByUserId: MANAGER_ID,
    ...overrides,
  };
}

function makeDetailAsset(overrides = {}) {
  return {
    id: ASSET_ID,
    code: 'PROP-00010',
    customAlias: null,
    assetClassId: LOOKUP_ID,
    ownerId: OWNER_ID,
    managedByUserId: MANAGER_ID,
    managedByCompanyId: COMPANY_ID,
    ownershipTypeId: LOOKUP_ID,
    addressLine1: '1 Main Street',
    addressLine2: null,
    city: 'London',
    county: null,
    postCode: 'SW1A 1AA',
    country: 'United Kingdom',
    propertyStatusId: LOOKUP_ID,
    propertyPurposeId: LOOKUP_ID,
    description: 'Three-bedroom house',
    purchaseDate: '2026-05-01T00:00:00.000Z',
    purchasePrice: '250000',
    isFinanced: true,
    depositPaid: '25000',
    dutiesTaxes: '5000',
    legalFees: '1500',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    owner: { id: OWNER_ID, firstName: 'Olivia', lastName: 'Owner', email: 'owner@example.com' },
    managedByUser: { id: MANAGER_ID, firstName: 'Manny', lastName: 'Manager', email: 'manager@example.com' },
    managedByCompany: { id: COMPANY_ID, name: 'Acme Property Management' },
    assetClass: { id: LOOKUP_ID, name: 'Property' },
    ownershipType: { id: LOOKUP_ID, name: 'Joint' },
    propertyStatus: { id: LOOKUP_ID, name: 'Occupied' },
    propertyPurpose: { id: LOOKUP_ID, name: 'Residential' },
    valuations: [],
    mortgages: [],
    shareholdings: [],
    transactions: [],
    ...overrides,
  };
}

function makeP2002Error(target: string[]) {
  const error = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
  return Object.assign(error, {
    code: 'P2002',
    meta: { target },
    clientVersion: 'test',
    name: 'PrismaClientKnownRequestError',
    message: 'Unique constraint failed',
  });
}

describe('Property Assets API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload());
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      if (typeof callback === 'function') {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ code: 'PROP-00009' }]),
          propertyAsset: {
            create: jest.fn().mockResolvedValue({ id: ASSET_ID }),
            findUnique: jest.fn().mockResolvedValue(makeDetailAsset()),
          },
          valuationEntry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          mortgageEntry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          shareholdingEntry: {
            create: jest.fn().mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID }),
            createMany: jest.fn().mockResolvedValue({ count: 2 }),
            update: jest.fn().mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID, ownershipPercent: '60' }),
            aggregate: jest.fn().mockResolvedValue({ _sum: { ownershipPercent: 100 } }),
          },
          transactionEntry: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        };
        return callback(tx);
      }
      return callback;
    });
  });

  it('401 GET /api/v1/assets/properties without token', async () => {
    await request(app).get('/api/v1/assets/properties').expect(401);
  });

  it('201 POST /api/v1/assets/properties creates a property asset with nested sub-entities', async () => {
    mockPrisma.lookupItem.findFirst.mockResolvedValue({ id: LOOKUP_ID });

    const res = await request(app)
      .post('/api/v1/assets/properties')
      .set('Authorization', AUTH)
      .send({
        ownerId: OTHER_ID,
        managedByUserId: MANAGER_ID,
        ownershipTypeId: LOOKUP_ID,
        addressLine1: '1 Main Street',
        city: 'London',
        postCode: 'SW1A 1AA',
        country: 'United Kingdom',
        propertyStatusId: LOOKUP_ID,
        propertyPurposeId: LOOKUP_ID,
        purchaseDate: '2026-05-01T00:00:00.000Z',
        purchasePrice: 250000,
        isFinanced: true,
        depositPaid: 25000,
        dutiesTaxes: 5000,
        legalFees: 1500,
        valuations: [
          {
            valuationDate: '2026-05-02T00:00:00.000Z',
            valuationAmount: 255000,
            valuationMethod: 'Desktop',
          },
        ],
        mortgages: [
          {
            lender: 'HSBC',
            mortgageTypeId: LOOKUP_ID,
            loanAmount: 200000,
            paymentStatusId: LOOKUP_ID,
            startDate: '2026-05-03T00:00:00.000Z',
          },
        ],
        shareholdings: [
          { shareholderName: 'Owner 1', ownershipPercent: 60, profitPercent: 60 },
          { shareholderName: 'Owner 2', ownershipPercent: 40, profitPercent: 40 },
        ],
        transactions: [
          {
            date: '2026-05-04T00:00:00.000Z',
            description: 'Initial refurbishment',
            amount: -5000,
            categoryId: LOOKUP_ID,
          },
        ],
      })
      .expect(201);

    expect(res.body.asset.id).toBe(ASSET_ID);
    expect(res.body.asset.code).toBe('PROP-00010');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'property_asset.create',
      entityType: 'PropertyAsset',
      actorId: OWNER_ID,
    }));
  });

  it('400 POST /api/v1/assets/properties rejects initial shareholding totals that do not equal 100', async () => {
    await request(app)
      .post('/api/v1/assets/properties')
      .set('Authorization', AUTH)
      .send({
        ownershipTypeId: LOOKUP_ID,
        addressLine1: '1 Main Street',
        city: 'London',
        postCode: 'SW1A 1AA',
        country: 'United Kingdom',
        propertyStatusId: LOOKUP_ID,
        propertyPurposeId: LOOKUP_ID,
        shareholdings: [
          { shareholderName: 'Owner 1', ownershipPercent: 70, profitPercent: 70 },
          { shareholderName: 'Owner 2', ownershipPercent: 20, profitPercent: 20 },
        ],
      })
      .expect(400);
  });

  it('400 POST /api/v1/assets/properties rejects requests with both manager types set', async () => {
    await request(app)
      .post('/api/v1/assets/properties')
      .set('Authorization', AUTH)
      .send({
        managedByUserId: MANAGER_ID,
        managedByCompanyId: COMPANY_ID,
        ownershipTypeId: LOOKUP_ID,
        addressLine1: '1 Main Street',
        city: 'London',
        postCode: 'SW1A 1AA',
        country: 'United Kingdom',
        propertyStatusId: LOOKUP_ID,
        propertyPurposeId: LOOKUP_ID,
      })
      .expect(400);
  });

  it('400 POST /api/v1/assets/properties rejects requests when the asset class does not resolve to Property', async () => {
    mockPrisma.lookupItem.findFirst.mockResolvedValue(null);

    await request(app)
      .post('/api/v1/assets/properties')
      .set('Authorization', AUTH)
      .send({
        assetClassId: LOOKUP_ID,
        ownershipTypeId: LOOKUP_ID,
        addressLine1: '1 Main Street',
        city: 'London',
        postCode: 'SW1A 1AA',
        country: 'United Kingdom',
        propertyStatusId: LOOKUP_ID,
        propertyPurposeId: LOOKUP_ID,
      })
      .expect(400);
  });

  it('409 POST /api/v1/assets/properties returns conflict when a custom alias is already in use', async () => {
    mockPrisma.lookupItem.findFirst.mockResolvedValue({ id: LOOKUP_ID });
    mockPrisma.$transaction.mockRejectedValue(makeP2002Error(['customAlias']));

    await request(app)
      .post('/api/v1/assets/properties')
      .set('Authorization', AUTH)
      .send({
        customAlias: 'my-property',
        ownershipTypeId: LOOKUP_ID,
        addressLine1: '1 Main Street',
        city: 'London',
        postCode: 'SW1A 1AA',
        country: 'United Kingdom',
        propertyStatusId: LOOKUP_ID,
        propertyPurposeId: LOOKUP_ID,
      })
      .expect(409);
  });

  it('200 GET /api/v1/assets/properties returns property assets', async () => {
    mockPrisma.propertyAsset.findMany.mockResolvedValue([
      {
        id: ASSET_ID,
        code: 'PROP-00010',
        customAlias: null,
        addressLine1: '1 Main Street',
        addressLine2: null,
        city: 'London',
        county: null,
        postCode: 'SW1A 1AA',
        country: 'United Kingdom',
        propertyStatus: { id: LOOKUP_ID, name: 'Occupied' },
        propertyPurpose: { id: LOOKUP_ID, name: 'Residential' },
        owner: { id: OWNER_ID, firstName: 'Olivia', lastName: 'Owner' },
        managedByUser: { id: MANAGER_ID, firstName: 'Manny', lastName: 'Manager' },
        managedByCompany: { id: COMPANY_ID, name: 'Acme Property Management' },
        valuations: [{ valuationDate: '2026-05-02T00:00:00.000Z', valuationAmount: '255000' }],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ]);

    const res = await request(app)
      .get('/api/v1/assets/properties')
      .set('Authorization', AUTH)
      .expect(200);

    expect(res.body.assets).toHaveLength(1);
  });

  it('404 GET /api/v1/assets/properties/:id when the asset is outside the user scope', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(null);

    await request(app)
      .get(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .expect(404);
  });

  it('200 PATCH /api/v1/assets/properties/:id allows the managing user to update the asset', async () => {
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload({ sub: MANAGER_ID, role: 'asset_manager' }));
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset({ ownerId: OWNER_ID, managedByUserId: MANAGER_ID }));
    mockPrisma.propertyAsset.findUnique.mockResolvedValue({ customAlias: null, ownerId: OWNER_ID });
    mockPrisma.propertyAsset.update.mockResolvedValue(makeDetailAsset({ city: 'Manchester' }));

    const res = await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .send({ city: 'Manchester' })
      .expect(200);

    expect(res.body.asset.city).toBe('Manchester');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'property_asset.update' }));
  });

  it('400 PATCH /api/v1/assets/properties/:id rejects requests with both manager types set', async () => {
    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .send({ managedByUserId: MANAGER_ID, managedByCompanyId: COMPANY_ID })
      .expect(400);
  });

  it('404 PATCH /api/v1/assets/properties/:id returns not found when the asset is outside the user scope', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(null);

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .send({ city: 'Manchester' })
      .expect(404);
  });

  it('404 PATCH /api/v1/assets/properties/:id returns not found when the asset row cannot be reloaded', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.propertyAsset.findUnique.mockResolvedValue(null);

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .send({ city: 'Manchester' })
      .expect(404);
  });

  it('400 PATCH /api/v1/assets/properties/:id rejects updates when the custom alias is already set', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.propertyAsset.findUnique.mockResolvedValue({ customAlias: 'locked-alias', ownerId: OWNER_ID });

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .send({ customAlias: 'new-alias' })
      .expect(400);
  });

  it('403 PATCH /api/v1/assets/properties/:id prevents non-admin owner reassignment', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.propertyAsset.findUnique.mockResolvedValue({ customAlias: null, ownerId: OWNER_ID });

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .send({ ownerId: OTHER_ID })
      .expect(403);
  });

  it('409 PATCH /api/v1/assets/properties/:id returns conflict when the custom alias is already in use', async () => {
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload({ sub: ADMIN_ID, role: 'system_admin' }));
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.propertyAsset.findUnique.mockResolvedValue({ customAlias: null, ownerId: OWNER_ID });
    mockPrisma.propertyAsset.update.mockRejectedValue(makeP2002Error(['customAlias']));

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .send({ customAlias: 'duplicate-alias' })
      .expect(409);
  });

  it('403 DELETE /api/v1/assets/properties/:id prevents a managing user from deleting the asset', async () => {
    mockVerifyAccessToken.mockReturnValue(makeTokenPayload({ sub: MANAGER_ID, role: 'asset_manager' }));
    mockPrisma.propertyAsset.findFirst.mockResolvedValue({ id: ASSET_ID, ownerId: OWNER_ID });

    await request(app)
      .delete(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .expect(403);
  });

  it('200 DELETE /api/v1/assets/properties/:id allows the owner to soft-delete the asset', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue({ id: ASSET_ID, ownerId: OWNER_ID });
    mockPrisma.propertyAsset.update.mockResolvedValue({ id: ASSET_ID });

    await request(app)
      .delete(`/api/v1/assets/properties/${ASSET_ID}`)
      .set('Authorization', AUTH)
      .expect(200);

    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'property_asset.delete' }));
  });

  it('200 GET /api/v1/assets/properties/:id/valuations lists valuations for an accessible asset', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset({ managedByUserId: null }));
    mockPrisma.valuationEntry.findMany.mockResolvedValue([{ id: ENTRY_ID, assetId: ASSET_ID }]);

    const res = await request(app)
      .get(`/api/v1/assets/properties/${ASSET_ID}/valuations`)
      .set('Authorization', AUTH)
      .expect(200);

    expect(res.body.items[0].id).toBe(ENTRY_ID);
  });

  it('201 POST /api/v1/assets/properties/:id/valuations creates a valuation entry', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.valuationEntry.create.mockResolvedValue({
      id: ENTRY_ID,
      assetId: ASSET_ID,
      valuationMethod: 'Desktop',
    });

    const res = await request(app)
      .post(`/api/v1/assets/properties/${ASSET_ID}/valuations`)
      .set('Authorization', AUTH)
      .send({
        valuationDate: '2026-05-02T00:00:00.000Z',
        valuationAmount: 255000,
        valuationMethod: 'Desktop',
        valuedBy: 'Surveyor Ltd',
      })
      .expect(201);

    expect(res.body.item.valuationMethod).toBe('Desktop');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'valuation_entry.create',
      entityType: 'ValuationEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('200 PATCH /api/v1/assets/properties/:id/valuations/:entryId updates a valuation entry', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.valuationEntry.findFirst.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID });
    mockPrisma.valuationEntry.update.mockResolvedValue({
      id: ENTRY_ID,
      assetId: ASSET_ID,
      valuationMethod: 'Full inspection',
    });

    const res = await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/valuations/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ valuationMethod: 'Full inspection' })
      .expect(200);

    expect(res.body.item.valuationMethod).toBe('Full inspection');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'valuation_entry.update',
      entityType: 'ValuationEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('404 PATCH /api/v1/assets/properties/:id/valuations/:entryId returns not found when the valuation entry does not exist', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.valuationEntry.findFirst.mockResolvedValue(null);

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/valuations/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ valuationMethod: 'Full inspection' })
      .expect(404);
  });

  it('200 GET /api/v1/assets/properties/:id/mortgages lists mortgage entries for an accessible asset', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.mortgageEntry.findMany.mockResolvedValue([{ id: ENTRY_ID, assetId: ASSET_ID, lender: 'HSBC' }]);

    const res = await request(app)
      .get(`/api/v1/assets/properties/${ASSET_ID}/mortgages`)
      .set('Authorization', AUTH)
      .expect(200);

    expect(res.body.items[0].lender).toBe('HSBC');
  });

  it('201 POST /api/v1/assets/properties/:id/mortgages creates a mortgage entry', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.mortgageEntry.create.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID, lender: 'HSBC' });

    const res = await request(app)
      .post(`/api/v1/assets/properties/${ASSET_ID}/mortgages`)
      .set('Authorization', AUTH)
      .send({
        lender: 'HSBC',
        mortgageTypeId: LOOKUP_ID,
        loanAmount: 200000,
        paymentStatusId: LOOKUP_ID,
        startDate: '2026-05-03T00:00:00.000Z',
      })
      .expect(201);

    expect(res.body.item.lender).toBe('HSBC');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'mortgage_entry.create',
      entityType: 'MortgageEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('200 PATCH /api/v1/assets/properties/:id/mortgages/:entryId updates a mortgage entry', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.mortgageEntry.findFirst.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID });
    mockPrisma.mortgageEntry.update.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID, lender: 'Barclays' });

    const res = await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/mortgages/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ lender: 'Barclays' })
      .expect(200);

    expect(res.body.item.lender).toBe('Barclays');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'mortgage_entry.update',
      entityType: 'MortgageEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('404 PATCH /api/v1/assets/properties/:id/mortgages/:entryId returns not found when the mortgage entry does not exist', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.mortgageEntry.findFirst.mockResolvedValue(null);

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/mortgages/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ lender: 'Barclays' })
      .expect(404);
  });

  it('200 GET /api/v1/assets/properties/:id/shareholdings lists shareholding entries for an accessible asset', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.shareholdingEntry.findMany.mockResolvedValue([{ id: ENTRY_ID, assetId: ASSET_ID, shareholderName: 'Owner 1' }]);

    const res = await request(app)
      .get(`/api/v1/assets/properties/${ASSET_ID}/shareholdings`)
      .set('Authorization', AUTH)
      .expect(200);

    expect(res.body.items[0].shareholderName).toBe('Owner 1');
  });

  it('201 POST /api/v1/assets/properties/:id/shareholdings creates a shareholding entry', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      shareholdingEntry: {
        create: jest.fn().mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID, shareholderName: 'Owner 3' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { ownershipPercent: 100 } }),
      },
    }));

    const res = await request(app)
      .post(`/api/v1/assets/properties/${ASSET_ID}/shareholdings`)
      .set('Authorization', AUTH)
      .send({
        shareholderName: 'Owner 3',
        ownershipPercent: 10,
        profitPercent: 10,
      })
      .expect(201);

    expect(res.body.item.shareholderName).toBe('Owner 3');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'shareholding_entry.create',
      entityType: 'ShareholdingEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('400 POST /api/v1/assets/properties/:id/shareholdings rejects creation when ownership total exceeds 100', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      shareholdingEntry: {
        create: jest.fn().mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { ownershipPercent: 110 } }),
      },
    }));

    await request(app)
      .post(`/api/v1/assets/properties/${ASSET_ID}/shareholdings`)
      .set('Authorization', AUTH)
      .send({
        shareholderName: 'Owner 3',
        ownershipPercent: 10,
        profitPercent: 10,
      })
      .expect(400);
  });

  it('200 PATCH /api/v1/assets/properties/:id/shareholdings/:entryId updates a shareholding entry when the total remains valid', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.shareholdingEntry.findFirst.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      shareholdingEntry: {
        update: jest.fn().mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID, shareholderName: 'Updated Owner' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { ownershipPercent: 100 } }),
      },
    }));

    const res = await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/shareholdings/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ shareholderName: 'Updated Owner' })
      .expect(200);

    expect(res.body.item.shareholderName).toBe('Updated Owner');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'shareholding_entry.update',
      entityType: 'ShareholdingEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('404 PATCH /api/v1/assets/properties/:id/shareholdings/:entryId returns not found when the shareholding entry does not exist', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.shareholdingEntry.findFirst.mockResolvedValue(null);

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/shareholdings/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ shareholderName: 'Updated Owner' })
      .expect(404);
  });

  it('400 PATCH /api/v1/assets/properties/:id/shareholdings/:entryId rejects updates that push ownership above 100', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.shareholdingEntry.findFirst.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID });
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      shareholdingEntry: {
        update: jest.fn().mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { ownershipPercent: 110 } }),
      },
    }));

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/shareholdings/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ ownershipPercent: 90 })
      .expect(400);
  });

  it('200 GET /api/v1/assets/properties/:id/transactions lists transactions with pagination metadata', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.transactionEntry.findMany.mockResolvedValue([
      { id: ENTRY_ID, assetId: ASSET_ID, description: 'Repair' },
      { id: '99999999-9999-4999-8999-999999999999', assetId: ASSET_ID, description: 'Insurance' },
    ]);

    const res = await request(app)
      .get(`/api/v1/assets/properties/${ASSET_ID}/transactions?limit=1`)
      .set('Authorization', AUTH)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.nextCursor).toBe(ENTRY_ID);
  });

  it('201 POST /api/v1/assets/properties/:id/transactions creates a transaction entry', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.transactionEntry.create.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID, description: 'Repair' });

    const res = await request(app)
      .post(`/api/v1/assets/properties/${ASSET_ID}/transactions`)
      .set('Authorization', AUTH)
      .send({
        date: '2026-05-04T00:00:00.000Z',
        description: 'Repair',
        amount: -250,
        categoryId: LOOKUP_ID,
      })
      .expect(201);

    expect(res.body.item.description).toBe('Repair');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'transaction_entry.create',
      entityType: 'TransactionEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('200 PATCH /api/v1/assets/properties/:id/transactions/:entryId updates a transaction entry', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.transactionEntry.findFirst.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID });
    mockPrisma.transactionEntry.update.mockResolvedValue({ id: ENTRY_ID, assetId: ASSET_ID, description: 'Updated repair' });

    const res = await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/transactions/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ description: 'Updated repair' })
      .expect(200);

    expect(res.body.item.description).toBe('Updated repair');
    expect(mockCreateAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'transaction_entry.update',
      entityType: 'TransactionEntry',
      entityId: ENTRY_ID,
    }));
  });

  it('404 PATCH /api/v1/assets/properties/:id/transactions/:entryId returns not found when the transaction entry does not exist', async () => {
    mockPrisma.propertyAsset.findFirst.mockResolvedValue(makeAccessibleAsset());
    mockPrisma.transactionEntry.findFirst.mockResolvedValue(null);

    await request(app)
      .patch(`/api/v1/assets/properties/${ASSET_ID}/transactions/${ENTRY_ID}`)
      .set('Authorization', AUTH)
      .send({ description: 'Updated repair' })
      .expect(404);
  });
});