import { PrismaClient, LookupItemType } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

// ── Lookup seed data ──────────────────────────────────────────────────────────

type LookupSeed = { type: LookupItemType; name: string; description?: string };

const LOOKUP_SEEDS: LookupSeed[] = [
  // Document Type
  { type: 'document_type', name: 'Valuation' },
  { type: 'document_type', name: 'Invoice / Receipt' },
  { type: 'document_type', name: 'Insurance' },
  { type: 'document_type', name: 'Mortgage Document' },
  { type: 'document_type', name: 'Tenancy Agreement' },
  { type: 'document_type', name: 'Title Deed' },
  { type: 'document_type', name: 'Legal' },
  { type: 'document_type', name: 'Compliance' },
  { type: 'document_type', name: 'Government Correspondence' },
  { type: 'document_type', name: 'Quotation' },
  { type: 'document_type', name: 'Other' },
  // Asset Class
  { type: 'asset_class', name: 'Property' },
  { type: 'asset_class', name: 'Stocks & ETFs' },
  // Transaction Category
  { type: 'transaction_category', name: 'Rent' },
  { type: 'transaction_category', name: 'Administration' },
  { type: 'transaction_category', name: 'Insurance' },
  { type: 'transaction_category', name: 'Repairs' },
  { type: 'transaction_category', name: 'Mortgage' },
  { type: 'transaction_category', name: 'Legal Fees' },
  { type: 'transaction_category', name: 'Duties & Taxes' },
  { type: 'transaction_category', name: 'Other' },
  // Company Type
  { type: 'company_type', name: 'Fund Manager' },
  { type: 'company_type', name: 'Estate Manager' },
  { type: 'company_type', name: 'Supplier' },
  { type: 'company_type', name: 'Lender' },
  // Property Status
  { type: 'property_status', name: 'Rented' },
  { type: 'property_status', name: 'Vacant' },
  { type: 'property_status', name: 'Resident' },
  { type: 'property_status', name: 'Unknown' },
  // Property Purpose
  { type: 'property_purpose', name: 'Rental' },
  { type: 'property_purpose', name: 'Commercial' },
  { type: 'property_purpose', name: 'Primary Residence' },
  { type: 'property_purpose', name: 'Non-Primary Residence' },
  { type: 'property_purpose', name: 'Other' },
  // Ownership Type
  { type: 'ownership_type', name: 'Personal' },
  { type: 'ownership_type', name: 'Limited Company' },
  { type: 'ownership_type', name: 'Other' },
  // Mortgage Type
  { type: 'mortgage_type', name: 'Interest Only' },
  { type: 'mortgage_type', name: 'Capital Repayment' },
  { type: 'mortgage_type', name: 'Other' },
  // Mortgage Payment Status
  { type: 'mortgage_payment_status', name: 'Up to Date' },
  { type: 'mortgage_payment_status', name: 'In Arrears' },
  { type: 'mortgage_payment_status', name: 'Arrangement to Pay' },
  { type: 'mortgage_payment_status', name: 'Default' },
  { type: 'mortgage_payment_status', name: 'Settled' },
  { type: 'mortgage_payment_status', name: 'Satisfied' },
  { type: 'mortgage_payment_status', name: 'Partially Settled' },
  { type: 'mortgage_payment_status', name: 'Unknown' },
];

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD must be set in .env',
    );
  }

  const passwordHash = await hash(password);

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
    update: {},
  });

  console.log(`✓ Super Admin seeded: ${user.email} (id: ${user.id})`);

  // Default system settings
  const defaultSettings = [
    {
      key: 'SELF_REGISTRATION_ENABLED',
      value: 'true',
      description: 'Allow public user registration',
    },
    {
      key: 'MAX_LOGIN_ATTEMPTS',
      value: '5',
      description: 'Maximum failed login attempts before account lockout',
    },
    {
      key: 'ACCOUNT_LOCKOUT_MINUTES',
      value: '30',
      description: 'Account lockout duration in minutes',
    },
    {
      key: 'EMAIL_VERIFICATION_EXPIRY_HOURS',
      value: '24',
      description: 'Email verification token expiry in hours',
    },
    {
      key: 'PASSWORD_RESET_EXPIRY_HOURS',
      value: '1',
      description: 'Password reset token expiry in hours',
    },
  ];

  for (const setting of defaultSettings) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: {},
    });
  }

  console.log(`✓ System settings seeded (${defaultSettings.length} entries)`);

  // Lookup items — idempotent: upsert by (type, name), assign sort order by position within type
  const byType = new Map<string, number>();
  let seeded = 0;
  for (const seed of LOOKUP_SEEDS) {
    const sortOrder = (byType.get(seed.type) ?? 0) + 1;
    byType.set(seed.type, sortOrder);
    await prisma.lookupItem.upsert({
      where: { type_name: { type: seed.type, name: seed.name } },
      create: { type: seed.type, name: seed.name, description: seed.description ?? null, sortOrder },
      update: {},
    });
    seeded++;
  }
  console.log(`✓ Lookup items seeded (${seeded} entries across ${byType.size} types)`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
