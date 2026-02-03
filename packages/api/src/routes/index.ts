import { Router } from 'express';
import healthRouter from './health.js';
import diamondsRouter from './diamonds.js';
import analyticsRouter from './analytics.js';
import triggersRouter from './triggers.js';
import heatmapRouter from './heatmap.js';
import pricingRulesRouter from './pricing-rules.js';
import nivodaRouter from './nivoda.js';
import { authMiddleware } from '../middleware/index.js';

const router = Router();

router.use('/health', healthRouter);

router.use('/api/v2/diamonds', authMiddleware, diamondsRouter);
router.use('/api/v2/analytics', authMiddleware, analyticsRouter);
router.use('/api/v2/triggers', authMiddleware, triggersRouter);
router.use('/api/v2/heatmap', authMiddleware, heatmapRouter);
router.use('/api/v2/pricing-rules', authMiddleware, pricingRulesRouter);
router.use('/api/v2/nivoda', authMiddleware, nivodaRouter);

export default router;
