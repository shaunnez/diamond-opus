import { Router } from 'express';
import healthRouter from './health.js';
import diamondsRouter from './diamonds.js';
import analyticsRouter from './analytics.js';
import triggersRouter from './triggers.js';
import { authMiddleware } from '../middleware/index.js';

const router = Router();

router.use('/health', healthRouter);

router.use('/api/v2/diamonds', authMiddleware, diamondsRouter);
router.use('/api/v2/analytics', authMiddleware, analyticsRouter);
router.use('/api/v2/triggers', authMiddleware, triggersRouter);

export default router;
