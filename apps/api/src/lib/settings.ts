import { prisma } from '@asset-manager/db';
import { redis } from './redis';
import { logger } from './logger';

// ── Setting definitions ───────────────────────────────────────────────────────

export type SettingKey =
  | 'SELF_REGISTRATION_ENABLED'
  | 'MAX_LOGIN_ATTEMPTS'
  | 'ACCOUNT_LOCKOUT_MINUTES'
  | 'EMAIL_VERIFICATION_EXPIRY_HOURS'
  | 'PASSWORD_RESET_EXPIRY_HOURS';

interface SettingMeta {
  description: string;
  type: 'boolean' | 'number';
  default: string;
}

export const SETTING_DEFINITIONS: Record<SettingKey, SettingMeta> = {
  SELF_REGISTRATION_ENABLED: {
    description: 'Allow users to self-register. When disabled only admins can create accounts.',
    type: 'boolean',
    default: 'true',
  },
  MAX_LOGIN_ATTEMPTS: {
    description: 'Number of failed login attempts before account lockout.',
    type: 'number',
    default: '5',
  },
  ACCOUNT_LOCKOUT_MINUTES: {
    description: 'Duration (minutes) an account is locked after too many failed logins.',
    type: 'number',
    default: '30',
  },
  EMAIL_VERIFICATION_EXPIRY_HOURS: {
    description: 'Hours until an email verification link expires.',
    type: 'number',
    default: '24',
  },
  PASSWORD_RESET_EXPIRY_HOURS: {
    description: 'Hours until a password reset link expires.',
    type: 'number',
    default: '1',
  },
};

export const ALL_SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

// ── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_TTL = 60; // seconds
const cacheKey = (key: string) => `setting:${key}`;

/**
 * Read a single setting with a 60-second Redis cache.
 * Falls back to the in-code default if DB is unavailable.
 */
export async function getSetting(key: SettingKey): Promise<string> {
  const ck = cacheKey(key);

  try {
    const cached = await redis.get(ck);
    if (cached !== null) return cached;
  } catch {
    // Redis unavailable — fall through to DB
  }

  try {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const value = row?.value ?? SETTING_DEFINITIONS[key].default;

    try {
      await redis.set(ck, value, 'EX', CACHE_TTL);
    } catch {
      // ignore cache write failures
    }

    return value;
  } catch (err) {
    logger.error('[settings] Failed to read setting from DB, using default', { key, err });
    return SETTING_DEFINITIONS[key].default;
  }
}

/**
 * Read a boolean setting.
 */
export async function getBoolSetting(key: SettingKey): Promise<boolean> {
  const val = await getSetting(key);
  return val === 'true';
}

/**
 * Read a number setting.
 */
export async function getNumSetting(key: SettingKey): Promise<number> {
  const val = await getSetting(key);
  const n = parseInt(val, 10);
  return isNaN(n) ? parseInt(SETTING_DEFINITIONS[key].default, 10) : n;
}

/**
 * Upsert a setting and invalidate the Redis cache.
 */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value, description: SETTING_DEFINITIONS[key].description },
  });
  try {
    await redis.del(cacheKey(key));
  } catch {
    // ignore
  }
}

/**
 * Ensure all settings have a row in the DB (idempotent seed).
 * Call this on API startup.
 */
export async function seedDefaultSettings(): Promise<void> {
  for (const [key, meta] of Object.entries(SETTING_DEFINITIONS) as [SettingKey, SettingMeta][]) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: meta.default, description: meta.description },
    });
  }
  logger.info('[settings] Default settings seeded');
}
