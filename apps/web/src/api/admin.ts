import { apiRequest } from './auth';

// All admin requests require a Bearer token
function adminReq<T>(path: string, init: RequestInit, accessToken: string): Promise<T> {
  return apiRequest<T>(`/admin${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  mfaEnabled?: boolean;
  updatedAt?: string;
}

export interface AdminSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ListUsersParams {
  cursor?: string;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
}

export interface ListUsersResponse {
  users: AdminUser[];
  nextCursor: string | null;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

export function listUsers(
  params: ListUsersParams,
  accessToken: string,
): Promise<ListUsersResponse> {
  const qs = new URLSearchParams();
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.role) qs.set('role', params.role);
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return adminReq<ListUsersResponse>(`/users${query}`, { method: 'GET' }, accessToken);
}

export function getUser(id: string, accessToken: string): Promise<{ user: AdminUser }> {
  return adminReq<{ user: AdminUser }>(`/users/${id}`, { method: 'GET' }, accessToken);
}

export function createUser(
  payload: CreateUserPayload,
  accessToken: string,
): Promise<{ user: AdminUser }> {
  return adminReq<{ user: AdminUser }>(
    '/users',
    { method: 'POST', body: JSON.stringify(payload) },
    accessToken,
  );
}

export function updateUser(
  id: string,
  payload: UpdateUserPayload,
  accessToken: string,
): Promise<{ user: AdminUser }> {
  return adminReq<{ user: AdminUser }>(
    `/users/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
    accessToken,
  );
}

export function setUserStatus(
  id: string,
  status: 'active' | 'disabled',
  accessToken: string,
): Promise<{ message: string }> {
  return adminReq<{ message: string }>(
    `/users/${id}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
    accessToken,
  );
}

export function deleteUser(id: string, accessToken: string): Promise<{ message: string }> {
  return adminReq<{ message: string }>(`/users/${id}`, { method: 'DELETE' }, accessToken);
}

export function resetUserMfa(id: string, accessToken: string): Promise<{ message: string }> {
  return adminReq<{ message: string }>(
    `/users/${id}/reset-mfa`,
    { method: 'POST' },
    accessToken,
  );
}

export function listUserSessions(
  id: string,
  accessToken: string,
): Promise<{ sessions: AdminSession[] }> {
  return adminReq<{ sessions: AdminSession[] }>(
    `/users/${id}/sessions`,
    { method: 'GET' },
    accessToken,
  );
}

export function revokeUserSession(
  userId: string,
  sessionId: string,
  accessToken: string,
): Promise<{ message: string }> {
  return adminReq<{ message: string }>(
    `/users/${userId}/sessions/${sessionId}`,
    { method: 'DELETE' },
    accessToken,
  );
}
