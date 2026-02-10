import type { Request, Response, NextFunction } from "express";
import { requireEnv } from "@diamond/shared";

export function nivodaProxyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.header("x-internal-token");
  const expected = requireEnv('INTERNAL_SERVICE_TOKEN');

  if (!expected) {
    res.status(500).json({
      error: { code: "MISCONFIGURED", message: "Internal token not configured" },
    });
    return;
  }

  if (!token || token !== expected) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "Invalid internal token" },
    });
    return;
  }

  next();
}
