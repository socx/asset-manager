import { Router } from 'express';
import { registerSchema } from '@asset-manager/types';
import { validate } from '../../middleware/validate';
import { registrationLimiter } from '../../middleware/rateLimiter';
import { registerHandler } from './register';

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post('/register', registrationLimiter, validate(registerSchema), registerHandler);

// Additional auth routes added in ITER-1-006 through ITER-1-012
