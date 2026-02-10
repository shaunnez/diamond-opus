import { Router } from 'express';
import { optionalEnv, requireEnv } from '@diamond/shared';

const router = Router();

/**
 * @openapi
 * /api/v2/system/config:
 *   get:
 *     summary: Get system configuration
 *     tags:
 *       - System
 *     security:
 *       - ApiKeyAuth: []
 *       - HMACAuth: []
 *     responses:
 *       200:
 *         description: System configuration details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 nivoda:
 *                   type: object
 *                   properties:
 *                     endpoint:
 *                       type: string
 *                       description: Direct Nivoda GraphQL API endpoint
 *                       example: https://api.nivoda.net/graphql
 *                     proxyEnabled:
 *                       type: boolean
 *                       description: Whether proxy routing is active
 *                     proxyUrl:
 *                       type: string
 *                       description: Proxy base URL (if proxy is enabled)
 *                       example: https://api.fourwords.co.nz
 */
router.get('/config', (_req, res) => {
  const nivodaEndpoint = requireEnv('NIVODA_ENDPOINT');
  const proxyUrl = optionalEnv('NIVODA_PROXY_BASE_URL', '');
  const proxyEnabled = !!proxyUrl;

  res.json({
    nivoda: {
      endpoint: nivodaEndpoint,
      proxyEnabled,
      ...(proxyEnabled && { proxyUrl }),
    },
  });
});

export default router;
