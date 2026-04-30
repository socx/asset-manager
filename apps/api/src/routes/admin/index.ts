import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/requireAuth';
import { requireStepUp } from '../../middleware/requireStepUp';
import { validate } from '../../middleware/validate';
import {
  Role,
  createUserSchema,
  updateUserSchema,
  setUserStatusSchema,
  createLookupItemSchema,
  updateLookupItemSchema,
  createCompanySchema,
  updateCompanySchema,
} from '@asset-manager/types';
import {
  listUsersHandler,
  getUserHandler,
  createUserHandler,
  updateUserHandler,
  setUserStatusHandler,
  deleteUserHandler,
  resetUserMfaHandler,
  listUserSessionsHandler,
  revokeUserSessionHandler,
} from './users';
import { listSettingsHandler, updateSettingHandler } from './settings';
import { listAuditLogsHandler } from './auditLogs';
import { listSystemLogsHandler } from './systemLogs';
import { activeUsersHandler, pageActivityHandler, healthHandler } from './dashboard';
import {
  listLookupItemsHandler,
  createLookupItemHandler,
  updateLookupItemHandler,
  deleteLookupItemHandler,
} from './lookupItems';
import {
  listCompaniesAdminHandler,
  getCompanyHandler,
  createCompanyHandler,
  updateCompanyHandler,
  deleteCompanyHandler,
} from './companies';

export const adminRouter = Router();

// All admin routes require auth + admin role + step-up auth
adminRouter.use(requireAuth, requireRole(Role.SUPER_ADMIN, Role.SYSTEM_ADMIN), requireStepUp);

// User management
adminRouter.get('/users', listUsersHandler);
adminRouter.post('/users', validate(createUserSchema), createUserHandler);
adminRouter.get('/users/:id', getUserHandler);
adminRouter.patch('/users/:id', validate(updateUserSchema), updateUserHandler);
adminRouter.patch('/users/:id/status', validate(setUserStatusSchema), setUserStatusHandler);
adminRouter.delete('/users/:id', deleteUserHandler);

// MFA reset — super_admin only
adminRouter.post(
  '/users/:id/reset-mfa',
  requireRole(Role.SUPER_ADMIN),
  resetUserMfaHandler,
);

// Session management
adminRouter.get('/users/:id/sessions', listUserSessionsHandler);
adminRouter.delete('/users/:id/sessions/:sessionId', revokeUserSessionHandler);

// System settings
adminRouter.get('/settings', listSettingsHandler);
adminRouter.patch('/settings/:key', requireRole(Role.SUPER_ADMIN), updateSettingHandler);

// Audit logs
adminRouter.get('/audit-logs', listAuditLogsHandler);

// System logs
adminRouter.get('/system-logs', listSystemLogsHandler);

// Dashboard (ITER-2-007/008/009)
adminRouter.get('/dashboard/active-users',  activeUsersHandler);
adminRouter.get('/dashboard/page-activity', pageActivityHandler);
adminRouter.get('/dashboard/health',        healthHandler);

// Lookup items (ITER-3-002)
adminRouter.get('/lookup/:type', listLookupItemsHandler);
adminRouter.post('/lookup/:type', validate(createLookupItemSchema), createLookupItemHandler);
adminRouter.patch('/lookup-items/:id', validate(updateLookupItemSchema), updateLookupItemHandler);
adminRouter.delete('/lookup-items/:id', deleteLookupItemHandler);

// Companies (ITER-3-003)
adminRouter.get('/companies', listCompaniesAdminHandler);
adminRouter.post('/companies', validate(createCompanySchema), createCompanyHandler);
adminRouter.get('/companies/:id', getCompanyHandler);
adminRouter.patch('/companies/:id', validate(updateCompanySchema), updateCompanyHandler);
adminRouter.delete('/companies/:id', deleteCompanyHandler);
