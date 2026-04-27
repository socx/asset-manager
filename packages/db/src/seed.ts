import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
