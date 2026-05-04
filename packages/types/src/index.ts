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

// ── MFA schemas (ITER-1-012) ───────────────────────────────────────────────────

export const mfaConfirmSchema = z.object({
  totpCode: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d{6}$/, 'TOTP code must be numeric'),
});

export const mfaDisableSchema = z.object({
  totpCode: z.string().length(6, 'TOTP code must be 6 digits').regex(/^\d{6}$/, 'TOTP code must be numeric'),
});

export const mfaVerifySchema = z.object({
  sessionChallenge: z.string().min(1),
  totpCode: z.string().length(6).regex(/^\d{6}$/).optional(),
  backupCode: z.string().min(1).optional(),
}).refine((data) => data.totpCode ?? data.backupCode, {
  message: 'Either totpCode or backupCode is required',
});

// ── Profile schemas (ITER-2-006) ──────────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
}).refine((d) => d.currentPassword !== d.newPassword, {
  message: 'New password must differ from current password',
  path: ['newPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ── Admin user schemas (ITER-1-014) ───────────────────────────────────────────

const roleEnum = z.enum(['super_admin', 'system_admin', 'asset_manager', 'asset_owner']);

export const createUserSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: roleEnum,
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  role: roleEnum.optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const setUserStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

// ── Inferred types ─────────────────────────────────────────────────────────────

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type MfaConfirmInput = z.infer<typeof mfaConfirmSchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;

// ── Lookup Item schemas (ITER-3-002) ──────────────────────────────────────────

export const LOOKUP_ITEM_TYPES = [
  'document_type',
  'asset_class',
  'transaction_category',
  'company_type',
  'property_status',
  'property_purpose',
  'ownership_type',
  'mortgage_type',
  'mortgage_payment_status',
] as const;
export type LookupItemType = (typeof LOOKUP_ITEM_TYPES)[number];

export const createLookupItemSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(255).optional(),
  sortOrder: z.number().int().positive().optional(),
});

export const updateLookupItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(255).nullable().optional(),
  sortOrder: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export type CreateLookupItemInput = z.infer<typeof createLookupItemSchema>;
export type UpdateLookupItemInput = z.infer<typeof updateLookupItemSchema>;

// ── Company schemas (ITER-3-003) ──────────────────────────────────────────────

export const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  companyTypeId: z.string().uuid().nullable().optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  county: z.string().max(100).optional(),
  postCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyTypeId: z.string().uuid().nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  county: z.string().max(100).nullable().optional(),
  postCode: z.string().max(20).nullable().optional(),
  country: z.string().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

// ── Property asset schemas (ITER-4) ──────────────────────────────────────────

const moneySchema = z.number().nonnegative();
const percentSchema = z.number().min(0).max(100);

export const createValuationEntrySchema = z.object({
  valuationDate: z.string().datetime(),
  valuationAmount: moneySchema,
  valuationMethod: z.string().min(1).max(100),
  valuedBy: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

export const createMortgageEntrySchema = z.object({
  lender: z.string().min(1).max(200),
  productName: z.string().max(200).optional(),
  mortgageTypeId: z.string().uuid(),
  loanAmount: moneySchema,
  interestRate: z.number().min(0).max(100).optional(),
  termYears: z.number().int().positive().optional(),
  paymentStatusId: z.string().uuid(),
  startDate: z.string().datetime(),
  settledAt: z.string().datetime().optional(),
  notes: z.string().max(1000).optional(),
});

export const createShareholdingEntrySchema = z.object({
  shareholderName: z.string().min(1).max(200),
  ownershipPercent: percentSchema,
  profitPercent: percentSchema,
  notes: z.string().max(1000).optional(),
});

export const createTransactionEntrySchema = z.object({
  date: z.string().datetime(),
  description: z.string().min(1).max(255),
  amount: z.number(),
  categoryId: z.string().uuid(),
});

export const createPropertyAssetSchema = z.object({
  customAlias: z.string().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/).optional(),
  assetClassId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  managedByUserId: z.string().uuid().nullable().optional(),
  managedByCompanyId: z.string().uuid().nullable().optional(),
  ownershipTypeId: z.string().uuid(),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  county: z.string().max(100).optional(),
  postCode: z.string().min(1).max(20),
  country: z.string().min(1).max(100),
  propertyStatusId: z.string().uuid(),
  propertyPurposeId: z.string().uuid(),
  description: z.string().max(1000).optional(),
  purchaseDate: z.string().datetime().optional(),
  purchasePrice: moneySchema.optional(),
  isFinanced: z.boolean().optional(),
  depositPaid: moneySchema.optional(),
  dutiesTaxes: moneySchema.optional(),
  legalFees: moneySchema.optional(),
  valuations: z.array(createValuationEntrySchema).optional(),
  mortgages: z.array(createMortgageEntrySchema).optional(),
  shareholdings: z.array(createShareholdingEntrySchema).optional(),
  transactions: z.array(createTransactionEntrySchema).optional(),
});

export const updatePropertyAssetSchema = z.object({
  customAlias: z.string().min(1).max(50).regex(/^[A-Za-z0-9_-]+$/).optional(),
  ownerId: z.string().uuid().optional(),
  managedByUserId: z.string().uuid().nullable().optional(),
  managedByCompanyId: z.string().uuid().nullable().optional(),
  ownershipTypeId: z.string().uuid().optional(),
  addressLine1: z.string().min(1).max(200).optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().min(1).max(100).optional(),
  county: z.string().max(100).nullable().optional(),
  postCode: z.string().min(1).max(20).optional(),
  country: z.string().min(1).max(100).optional(),
  propertyStatusId: z.string().uuid().optional(),
  propertyPurposeId: z.string().uuid().optional(),
  description: z.string().max(1000).nullable().optional(),
  purchaseDate: z.string().datetime().nullable().optional(),
  purchasePrice: moneySchema.nullable().optional(),
  isFinanced: z.boolean().nullable().optional(),
  depositPaid: moneySchema.nullable().optional(),
  dutiesTaxes: moneySchema.nullable().optional(),
  legalFees: moneySchema.nullable().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const createValuationEntryInputSchema = createValuationEntrySchema;
export const createMortgageEntryInputSchema = createMortgageEntrySchema;
export const createShareholdingEntryInputSchema = createShareholdingEntrySchema;
export const createTransactionEntryInputSchema = createTransactionEntrySchema;

export const updateValuationEntrySchema = z.object({
  valuationDate: z.string().datetime().optional(),
  valuationAmount: moneySchema.optional(),
  valuationMethod: z.string().min(1).max(100).optional(),
  valuedBy: z.string().max(200).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const updateMortgageEntrySchema = z.object({
  lender: z.string().min(1).max(200).optional(),
  productName: z.string().max(200).nullable().optional(),
  mortgageTypeId: z.string().uuid().optional(),
  loanAmount: moneySchema.optional(),
  interestRate: z.number().min(0).max(100).nullable().optional(),
  termYears: z.number().int().positive().nullable().optional(),
  paymentStatusId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  settledAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const updateShareholdingEntrySchema = z.object({
  shareholderName: z.string().min(1).max(200).optional(),
  ownershipPercent: percentSchema.optional(),
  profitPercent: percentSchema.optional(),
  notes: z.string().max(1000).nullable().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export const updateTransactionEntrySchema = z.object({
  date: z.string().datetime().optional(),
  description: z.string().min(1).max(255).optional(),
  amount: z.number().optional(),
  categoryId: z.string().uuid().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), {
  message: 'At least one field must be provided',
});

export type CreatePropertyAssetInput = z.infer<typeof createPropertyAssetSchema>;
export type UpdatePropertyAssetInput = z.infer<typeof updatePropertyAssetSchema>;
export type CreateValuationEntryInput = z.infer<typeof createValuationEntryInputSchema>;
export type CreateMortgageEntryInput = z.infer<typeof createMortgageEntryInputSchema>;
export type CreateShareholdingEntryInput = z.infer<typeof createShareholdingEntryInputSchema>;
export type CreateTransactionEntryInput = z.infer<typeof createTransactionEntryInputSchema>;
export type UpdateValuationEntryInput = z.infer<typeof updateValuationEntrySchema>;
export type UpdateMortgageEntryInput = z.infer<typeof updateMortgageEntrySchema>;
export type UpdateShareholdingEntryInput = z.infer<typeof updateShareholdingEntrySchema>;
export type UpdateTransactionEntryInput = z.infer<typeof updateTransactionEntrySchema>;
