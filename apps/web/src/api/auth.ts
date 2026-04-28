const API_BASE = '/api/v1';

interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

export class ApiResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiResponseError';
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });

  const data = (await res.json()) as T | ApiError;

  if (!res.ok) {
    const err = data as ApiError;
    throw new ApiResponseError(err.message ?? 'Request failed', res.status, err.errors);
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
  return request<RegisterResponse>('/auth/register', {
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
  return request<LoginResponse | MfaRequiredResponse>('/auth/login', {
    method: 'POST',
    credentials: 'include', // send/receive HttpOnly cookies
    body: JSON.stringify(payload),
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function logout(): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
}
