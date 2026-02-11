import { Router } from "express";
import type { Request, Response } from "express";
import { nivodaProxyAuth } from "../middleware/nivodaProxyAuth.js";
import { createRateLimiterMiddleware } from "../middleware/rateLimiter.js";
import {
  requireEnv,
  createServiceLogger,
  NIVODA_PROXY_RATE_LIMIT,
  NIVODA_PROXY_RATE_LIMIT_WINDOW_MS,
  NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS,
  NIVODA_PROXY_TIMEOUT_MS,
} from "@diamond/shared";

const router = Router();
const logger = createServiceLogger('api', { component: 'nivoda-proxy' });

const MAX_QUERY_SIZE = 100_000; // 100KB
const MAX_VARIABLES_SIZE = 500_000; // 500KB

const rateLimiter = createRateLimiterMiddleware({
  maxRequestsPerWindow: NIVODA_PROXY_RATE_LIMIT,
  windowMs: NIVODA_PROXY_RATE_LIMIT_WINDOW_MS,
  maxWaitMs: NIVODA_PROXY_RATE_LIMIT_MAX_WAIT_MS,
});

router.post(
  "/graphql",
  nivodaProxyAuth,
  rateLimiter,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { query, variables, operationName } = req.body ?? {};
    const traceId = req.header("x-trace-id") ?? crypto.randomUUID();

    logger.info('nivoda_proxy_request_start', {
      traceId,
      operationName,
      hasQuery: !!query,
      hasVariables: !!variables,
    });

    if (!query) {
      logger.warn('nivoda_proxy_missing_query', { traceId });
      res.status(400).json({
        error: { code: "BAD_REQUEST", message: "GraphQL query is required" },
      });
      return;
    }

    // Validate query size
    const querySize = Buffer.byteLength(query, 'utf-8');
    if (querySize > MAX_QUERY_SIZE) {
      logger.warn('nivoda_proxy_query_too_large', { traceId, querySize, maxSize: MAX_QUERY_SIZE });
      res.status(413).json({
        error: { code: "PAYLOAD_TOO_LARGE", message: `Query exceeds maximum size of ${MAX_QUERY_SIZE} bytes` },
      });
      return;
    }

    // Validate variables size
    if (variables) {
      const variablesSize = Buffer.byteLength(JSON.stringify(variables), 'utf-8');
      if (variablesSize > MAX_VARIABLES_SIZE) {
        logger.warn('nivoda_proxy_variables_too_large', { traceId, variablesSize, maxSize: MAX_VARIABLES_SIZE });
        res.status(413).json({
          error: { code: "PAYLOAD_TOO_LARGE", message: `Variables exceed maximum size of ${MAX_VARIABLES_SIZE} bytes` },
        });
        return;
      }
    }

    const url = requireEnv('NIVODA_ENDPOINT');

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), NIVODA_PROXY_TIMEOUT_MS);

      const fetchStart = Date.now();
      const upstream = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-trace-id": traceId,
        },
        body: JSON.stringify({
          query,
          variables,
          operationName,
        }),
      }).finally(() => clearTimeout(timeout));

      const body = await upstream.text();
      const fetchDuration = Date.now() - fetchStart;
      const totalDuration = Date.now() - startTime;

      logger.info('nivoda_proxy_request_complete', {
        traceId,
        operationName,
        status: upstream.status,
        fetchDuration,
        totalDuration,
        bodySize: body.length,
        success: upstream.ok,
      });

      res.status(upstream.status);
      res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
      res.setHeader("x-trace-id", traceId);
      res.send(body);
    } catch (err) {
      const duration = Date.now() - startTime;
      const isTimeout = err instanceof Error && err.name === 'AbortError';

      logger.error('nivoda_proxy_request_failed', err, {
        traceId,
        operationName,
        duration,
        isTimeout,
      });

      res.status(502).json({
        error: {
          code: "BAD_GATEWAY",
          message: isTimeout ? "Nivoda request timeout" : "Failed to reach Nivoda",
          traceId,
        },
      });
    }
  }
);

export default router;
