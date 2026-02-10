import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { optionalEnv } from "@diamond/shared";

export function nivodaProxyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.header("x-internal-token");
  const expected = optionalEnv('INTERNAL_SERVICE_TOKEN', '');

  if (!expected) {
    res.status(500).json({
      error: { code: "MISCONFIGURED", message: "Internal token not configured" },
    });
    return;
  }

  if (!token) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Invalid internal token" },
    });
    return;
  }

  // Use constant-time comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(token, 'utf-8');
  const expectedBuffer = Buffer.from(expected, 'utf-8');

  if (tokenBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Invalid internal token" },
    });
    return;
  }

  next();
}
