import { z } from 'zod';

// ── Enums ──────────────────────────────────────────────────────────────────────

export const Role = {
  SUPER_ADMIN: 'super_admin',
  SYSTEM_ADMIN: 'system_admin',
  ASSET_MANAGER: 'asset_manager',
  ASSET_OWNER: 'asset_owner',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const UserStatus = {
  PENDING_VERIFICATION: 'pending_verification',
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

// ── Password validation ────────────────────────────────────────────────────────

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// ── Auth schemas ───────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: passwordSchema,
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

// ── Inferred types ─────────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
