import { Router } from 'express';
import healthRouter from './health.js';
import diamondsRouter from './diamonds.js';
import analyticsRouter from './analytics.js';
import triggersRouter from './triggers.js';
import heatmapRouter from './heatmap.js';
import pricingRulesRouter from './pricing-rules.js';
import nivodaRouter from './nivoda.js';
import nivodaProxyRouter from './nivodaProxy.js';
import tradingRouter from './trading.js';
import systemRouter from './system.js';
import { authMiddleware } from '../middleware/index.js';

const router = Router();

router.use('/health', healthRouter);

// Internal proxy for Nivoda GraphQL API, protected by a separate auth middleware
router.use('/api/v2/internal/nivoda', nivodaProxyRouter);

// All other API routes, protected by main auth middleware
router.use('/api/v2/diamonds', authMiddleware, diamondsRouter);
router.use('/api/v2/analytics', authMiddleware, analyticsRouter);
router.use('/api/v2/triggers', authMiddleware, triggersRouter);
router.use('/api/v2/heatmap', authMiddleware, heatmapRouter);
router.use('/api/v2/pricing-rules', authMiddleware, pricingRulesRouter);
router.use('/api/v2/nivoda', authMiddleware, nivodaRouter);
router.use('/api/v2/trading', authMiddleware, tradingRouter);
router.use('/api/v2/system', authMiddleware, systemRouter);

export default router;
