import { Router } from 'express';
import { authRouter } from './auth';
import { adminRouter } from './admin';

export const router = Router();

// Auth routes (ITER-1-005 through ITER-1-012)
router.use('/auth', authRouter);

// Admin routes (ITER-1-014+)
router.use('/admin', adminRouter);
