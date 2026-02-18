import type { Request, Response, NextFunction } from "express";
import {
  sha256,
  notify,
  NotifyCategory,
} from "@diamond/shared";
import { getApiKeyByHash, updateApiKeyLastUsed } from "@diamond/database";

// Track repeated auth failures per source IP to detect brute-force attempts
const AUTH_FAILURE_THRESHOLD = 10;
const AUTH_FAILURE_WINDOW_MS = 5 * 60_000; // 5 minutes

interface FailureRecord {
  count: number;
  windowStart: number;
  notified: boolean;
}

const authFailures = new Map<string, FailureRecord>();

function trackAuthFailure(source: string): void {
  const now = Date.now();
  let record = authFailures.get(source);

  if (!record || now - record.windowStart >= AUTH_FAILURE_WINDOW_MS) {
    record = { count: 0, windowStart: now, notified: false };
    authFailures.set(source, record);
  }

  record.count++;

  if (record.count >= AUTH_FAILURE_THRESHOLD && !record.notified) {
    record.notified = true;
    notify({
      category: NotifyCategory.AUTH_FAILURE,
      title: 'Repeated Auth Failures',
      message: `${record.count} failed authentication attempts from ${source} in the last 5 minutes.`,
      context: { source, count: String(record.count) },
    }).catch(() => {});
  }
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  const keyHash = sha256(apiKey);
  const apiKeyRecord = await getApiKeyByHash(keyHash);

  if (apiKeyRecord) {
    updateApiKeyLastUsed(apiKeyRecord.id).catch(() => {});
    return true;
  }

  return false;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (apiKey) {
    const isValid = await validateApiKey(apiKey);
    if (isValid) {
      next();
      return;
    }
  }

  const source = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  trackAuthFailure(source);
  res.status(401).json({
    error: {
      code: "UNAUTHORIZED",
      message: "Invalid or missing API key",
    },
  });
}
