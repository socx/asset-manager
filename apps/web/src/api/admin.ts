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

// ── Settings ──────────────────────────────────────────────────────────────────

export interface SystemSetting {
  key: string;
  value: string;
  type: 'boolean' | 'number';
  description: string;
}

export function listSettings(accessToken: string): Promise<{ settings: SystemSetting[] }> {
  return adminReq<{ settings: SystemSetting[] }>('/settings', { method: 'GET' }, accessToken);
}

export function updateSetting(
  key: string,
  value: string,
  accessToken: string,
): Promise<{ key: string; value: string; message: string }> {
  return adminReq<{ key: string; value: string; message: string }>(
    `/settings/${key}`,
    { method: 'PATCH', body: JSON.stringify({ value }) },
    accessToken,
  );
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface ListAuditLogsParams {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export interface ListAuditLogsResponse {
  logs: AuditLog[];
  nextCursor: string | null;
}

export function listAuditLogs(
  params: ListAuditLogsParams,
  accessToken: string,
): Promise<ListAuditLogsResponse> {
  const qs = new URLSearchParams();
  if (params.actorId) qs.set('actorId', params.actorId);
  if (params.action) qs.set('action', params.action);
  if (params.entityType) qs.set('entityType', params.entityType);
  if (params.entityId) qs.set('entityId', params.entityId);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return adminReq<ListAuditLogsResponse>(`/audit-logs${query}`, { method: 'GET' }, accessToken);
}

// ── System Logs ───────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface SystemLog {
  id: string;
  level: LogLevel;
  service: string;
  message: string;
  context: unknown;
  traceId: string | null;
  createdAt: string;
}

export interface ListSystemLogsParams {
  level?: LogLevel;
  service?: string;
  traceId?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

export interface ListSystemLogsResponse {
  logs: SystemLog[];
  nextCursor: string | null;
}

export function listSystemLogs(
  params: ListSystemLogsParams,
  accessToken: string,
): Promise<ListSystemLogsResponse> {
  const qs = new URLSearchParams();
  if (params.level) qs.set('level', params.level);
  if (params.service) qs.set('service', params.service);
  if (params.traceId) qs.set('traceId', params.traceId);
  if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
  if (params.dateTo) qs.set('dateTo', params.dateTo);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return adminReq<ListSystemLogsResponse>(`/system-logs${query}`, { method: 'GET' }, accessToken);
}
