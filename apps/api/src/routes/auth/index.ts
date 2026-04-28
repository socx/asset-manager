import { Router } from 'express';
import {
  registerSchema,
  resendVerificationSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mfaConfirmSchema,
  mfaDisableSchema,
  mfaVerifySchema,
} from '@asset-manager/types';
import { validate } from '../../middleware/validate';
import {
  registrationLimiter,
  resendVerificationLimiter,
  authLimiter,
  forgotPasswordLimiter,
} from '../../middleware/rateLimiter';
import { requireAuth } from '../../middleware/requireAuth';
import { registerHandler } from './register';
import { verifyEmailHandler } from './verifyEmail';
import { resendVerificationHandler } from './resendVerification';
import { loginHandler } from './login';
import { refreshHandler, listSessionsHandler, revokeSessionHandler, revokeAllSessionsHandler } from './sessions';
import { logoutHandler } from './logout';
import { forgotPasswordHandler } from './forgotPassword';
import { resetPasswordHandler } from './resetPassword';
import { mfaSetupHandler, mfaConfirmHandler, mfaDisableHandler } from './mfa';
import { mfaVerifyHandler } from './mfaVerify';
import { stepUpHandler } from './stepUp';

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

// POST /api/v1/auth/login  (ITER-1-008)
authRouter.post('/login', authLimiter, validate(loginSchema), loginHandler);

// POST /api/v1/auth/refresh  (ITER-1-009)
authRouter.post('/refresh', refreshHandler);

// GET    /api/v1/auth/sessions  (ITER-1-009)
authRouter.get('/sessions', requireAuth, listSessionsHandler);

// DELETE /api/v1/auth/sessions/:sessionId  (ITER-1-009)
authRouter.delete('/sessions/:sessionId', requireAuth, revokeSessionHandler);

// DELETE /api/v1/auth/sessions  (ITER-1-009)
authRouter.delete('/sessions', requireAuth, revokeAllSessionsHandler);

// POST /api/v1/auth/logout  (ITER-1-010)
authRouter.post('/logout', requireAuth, logoutHandler);

// POST /api/v1/auth/forgot-password  (ITER-1-011)
authRouter.post('/forgot-password', forgotPasswordLimiter, validate(forgotPasswordSchema), forgotPasswordHandler);

// POST /api/v1/auth/reset-password  (ITER-1-011)
authRouter.post('/reset-password', validate(resetPasswordSchema), resetPasswordHandler);

// POST /api/v1/auth/mfa/setup    (ITER-1-012)
authRouter.post('/mfa/setup', requireAuth, mfaSetupHandler);

// POST /api/v1/auth/mfa/confirm  (ITER-1-012)
authRouter.post('/mfa/confirm', requireAuth, validate(mfaConfirmSchema), mfaConfirmHandler);

// POST /api/v1/auth/mfa/disable  (ITER-1-012)
authRouter.post('/mfa/disable', requireAuth, validate(mfaDisableSchema), mfaDisableHandler);

// POST /api/v1/auth/mfa/verify   (ITER-1-012) — public, challenge proves identity
authRouter.post('/mfa/verify', authLimiter, validate(mfaVerifySchema), mfaVerifyHandler);

// POST /api/v1/auth/step-up  (ITER-1-014) — re-authenticate for admin actions
authRouter.post('/step-up', requireAuth, stepUpHandler);
