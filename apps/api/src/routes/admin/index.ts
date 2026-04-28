import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/requireAuth';
import { requireStepUp } from '../../middleware/requireStepUp';
import { validate } from '../../middleware/validate';
import { Role, createUserSchema, updateUserSchema, setUserStatusSchema } from '@asset-manager/types';
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
