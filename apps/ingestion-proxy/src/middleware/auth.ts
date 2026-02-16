import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { optionalEnv, createServiceLogger } from "@diamond/shared";

const logger = createServiceLogger('ingestion-proxy', { component: 'auth' });

export function nivodaProxyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.header("x-internal-token");
  const traceId = req.header("x-trace-id") ?? crypto.randomUUID();
  const expected = optionalEnv('INTERNAL_SERVICE_TOKEN', '');

  if (!expected) {
    logger.error('auth_misconfigured', new Error('INTERNAL_SERVICE_TOKEN not set'), { traceId });
    res.status(500).json({
      error: { code: "MISCONFIGURED", message: "Internal token not configured", traceId },
    });
    return;
  }

  if (!token) {
    logger.warn('auth_missing_token', { traceId });
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Invalid internal token", traceId },
    });
    return;
  }

  // Use constant-time comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(token, 'utf-8');
  const expectedBuffer = Buffer.from(expected, 'utf-8');

  if (tokenBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
    logger.warn('auth_invalid_token', { traceId });
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Invalid internal token", traceId },
    });
    return;
  }

  logger.info('auth_success', { traceId });
  next();
}
