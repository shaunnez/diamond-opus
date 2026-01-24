import { Router } from 'express';
import healthRouter from './health.js';
import diamondsRouter from './diamonds.js';
import { authMiddleware } from '../middleware/index.js';

const router = Router();

router.use('/health', healthRouter);

router.use('/api/v2/diamonds', authMiddleware, diamondsRouter);

export default router;
