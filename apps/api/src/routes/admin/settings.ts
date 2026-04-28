import type { Response } from 'express';
import { z } from 'zod';
import {
  getSetting,
  setSetting,
  ALL_SETTING_KEYS,
  SETTING_DEFINITIONS,
  type SettingKey,
} from '../../lib/settings';
import { createAuditLog } from '../../lib/audit';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../../middleware/requireAuth';

// ── GET /api/v1/admin/settings ────────────────────────────────────────────────

export async function listSettingsHandler(
  _req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const settings = await Promise.all(
    ALL_SETTING_KEYS.map(async (key) => ({
      key,
      value: await getSetting(key),
      type: SETTING_DEFINITIONS[key].type,
      description: SETTING_DEFINITIONS[key].description,
    })),
  );

  res.json({ settings });
}

// ── PATCH /api/v1/admin/settings/:key ─────────────────────────────────────────

const patchSchema = z.object({ value: z.string().min(1, 'Value is required') });

export async function updateSettingHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const key = req.params.key as string;

  if (!ALL_SETTING_KEYS.includes(key as SettingKey)) {
    res.status(404).json({ message: `Unknown setting key: ${key}` });
    return;
  }

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Value is required.', errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const typedKey = key as SettingKey;
  const meta = SETTING_DEFINITIONS[typedKey];
  const { value } = parsed.data;

  // Type validation
  if (meta.type === 'boolean' && value !== 'true' && value !== 'false') {
    res.status(400).json({ message: 'Boolean settings must be "true" or "false".' });
    return;
  }
  if (meta.type === 'number') {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) {
      res.status(400).json({ message: 'Numeric settings must be a positive integer.' });
      return;
    }
  }

  const oldValue = await getSetting(typedKey);
  await setSetting(typedKey, value);

  await createAuditLog({
    actorId: req.user?.sub ?? '',
    actorRole: req.user?.role ?? '',
    action: 'SETTING_UPDATED',
    entityType: 'system_setting',
    entityId: key,
    oldValue: { key, value: oldValue },
    newValue: { key, value },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  logger.info('[settings] Setting updated', { key, oldValue, newValue: value, actorId: req.user?.sub ?? '' });

  res.json({ key: typedKey, value, message: 'Setting updated successfully.' });
}
