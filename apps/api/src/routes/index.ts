import { Router } from 'express';
import { authRouter } from './auth';
import { adminRouter } from './admin';
import { telemetryRouter } from './telemetry';
import { lookupRouter } from './lookup';
import { companiesRouter } from './companies';

export const router = Router();

// Auth routes (ITER-1-005 through ITER-1-012)
router.use('/auth', authRouter);

// Admin routes (ITER-1-014+)
router.use('/admin', adminRouter);

// Telemetry (ITER-2-008) — no auth required
router.use('/telemetry', telemetryRouter);

// Lookup / reference data (ITER-3-002) — any authenticated user
router.use('/lookup', lookupRouter);

// Companies (ITER-3-003) — public read for any authenticated user
router.use('/companies', companiesRouter);
