import { Router } from 'express';
import { registerSchema, resendVerificationSchema } from '@asset-manager/types';
import { validate } from '../../middleware/validate';
import { registrationLimiter, resendVerificationLimiter } from '../../middleware/rateLimiter';
import { registerHandler } from './register';
import { verifyEmailHandler } from './verifyEmail';
import { resendVerificationHandler } from './resendVerification';

export const authRouter = Router();

// POST /api/v1/auth/register  (ITER-1-005)
authRouter.post('/register', registrationLimiter, validate(registerSchema), registerHandler);

// GET  /api/v1/auth/verify-email?token=<token>  (ITER-1-006)
authRouter.get('/verify-email', verifyEmailHandler);

// POST /api/v1/auth/resend-verification  (ITER-1-007)
authRouter.post(
  '/resend-verification',
  resendVerificationLimiter,
  validate(resendVerificationSchema),
  resendVerificationHandler,
);

// Additional auth routes added in ITER-1-008 through ITER-1-012
