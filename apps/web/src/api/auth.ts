const API_BASE = '/api/v1';

interface ApiError {
  message: string;
  code?: string;
  errors?: Record<string, string[]>;
}

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiResponseError';
  }
}

export async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });

  const data = (await res.json()) as T | ApiError;

  if (!res.ok) {
    const err = data as ApiError;
    throw new ApiResponseError(err.message ?? 'Request failed', res.status, err.code, err.errors);
  }

  return data as T;
}

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface RegisterResponse {
  message: string;
}

export function register(payload: RegisterPayload): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface MfaRequiredResponse {
  mfaRequired: true;
  sessionChallenge: string;
}

export function login(payload: LoginPayload): Promise<LoginResponse | MfaRequiredResponse> {
  return apiRequest<LoginResponse | MfaRequiredResponse>('/auth/login', {
    method: 'POST',
    credentials: 'include', // send/receive HttpOnly cookies
    body: JSON.stringify(payload),
  });
}

// ── Refresh ───────────────────────────────────────────────────────────────────

export function refresh(): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function logout(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}

// ── Forgot Password ───────────────────────────────────────────────────────────

export interface ForgotPasswordPayload {
  email: string;
}

export function forgotPassword(payload: ForgotPasswordPayload): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── Reset Password ────────────────────────────────────────────────────────────

export interface ResetPasswordPayload {
  token: string;
  newPassword: string;
}

export function resetPassword(payload: ResetPasswordPayload): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── MFA (ITER-1-012) ──────────────────────────────────────────────────────────

export interface MfaSetupResponse {
  secret: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export function mfaSetup(): Promise<MfaSetupResponse> {
  return apiRequest<MfaSetupResponse>('/auth/mfa/setup', {
    method: 'POST',
    credentials: 'include',
  });
}

export function mfaConfirm(totpCode: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/mfa/confirm', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ totpCode }),
  });
}

export function mfaDisable(totpCode: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/mfa/disable', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify({ totpCode }),
  });
}

export interface MfaVerifyPayload {
  sessionChallenge: string;
  totpCode?: string;
  backupCode?: string;
}

export function mfaVerify(payload: MfaVerifyPayload): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/mfa/verify', {
    method: 'POST',
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

// ── Step-up auth (ITER-1-014) ─────────────────────────────────────────────────

export function stepUp(password: string, accessToken: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/step-up', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
}

// ── Profile (ITER-2-006) ──────────────────────────────────────────────────────

export function changePassword(
  payload: { currentPassword: string; newPassword: string },
  accessToken: string,
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/auth/profile/password', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
}
