import { apiRequest } from './auth';

export interface ActiveUsersResponse {
  adminOnline: number;
  appOnline: number;
  totalOnline: number;
  hourlyActivity: { hour: string; sessions: number }[];
  updatedAt: string;
}

export interface PageActivityResponse {
  pages: { path: string; activeUsers: number }[];
  updatedAt: string;
}

export interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'offline';
  checkedAt: string;
  latencyMs?: number;
}

export interface HealthResponse {
  api:    ServiceStatus;
  db:     ServiceStatus;
  worker: ServiceStatus;
}

export function getActiveUsers(accessToken: string): Promise<ActiveUsersResponse> {
  return apiRequest<ActiveUsersResponse>('/admin/dashboard/active-users', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getPageActivity(accessToken: string): Promise<PageActivityResponse> {
  return apiRequest<PageActivityResponse>('/admin/dashboard/page-activity', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function getDashboardHealth(accessToken: string): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/admin/dashboard/health', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
