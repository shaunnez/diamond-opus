import { Router } from 'express';
import healthRouter from './health.js';
import diamondsRouter from './diamonds.js';
import analyticsRouter from './analytics.js';
import triggersRouter from './triggers.js';
import heatmapRouter from './heatmap.js';
import pricingRulesRouter from './pricing-rules.js';
import ratingRulesRouter from './rating-rules.js';
import systemRouter from './system.js';
import checkoutRouter from './checkout.js';
import webhooksRouter from './webhooks.js';
import { authMiddleware } from '../middleware/index.js';

const router = Router();

router.use('/health', healthRouter);

// Webhook route — no auth (Stripe signature verification only)
router.use('/api/v2/webhooks', webhooksRouter);

// Diamonds — public (no auth required, protected by Cloudflare + rate limiting)
router.use('/api/v2/diamonds', diamondsRouter);
router.use('/api/v2/analytics', authMiddleware, analyticsRouter);
router.use('/api/v2/triggers', authMiddleware, triggersRouter);
router.use('/api/v2/heatmap', authMiddleware, heatmapRouter);
router.use('/api/v2/pricing-rules', authMiddleware, pricingRulesRouter);
router.use('/api/v2/rating-rules', authMiddleware, ratingRulesRouter);
router.use('/api/v2/system', authMiddleware, systemRouter);
router.use('/api/v2/checkout', authMiddleware, checkoutRouter);

export default router;
