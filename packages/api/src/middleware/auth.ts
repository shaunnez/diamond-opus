import type { Request, Response, NextFunction } from "express";
import {
  sha256,
  hmacSha256,
  secureCompare,
  parseJsonEnv,
  HMAC_TIMESTAMP_TOLERANCE_SECONDS,
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

interface HmacSecrets {
  [clientId: string]: string;
}

let cachedHmacSecrets: HmacSecrets | null = null;

function getHmacSecrets(): HmacSecrets {
  if (!cachedHmacSecrets) {
    cachedHmacSecrets = parseJsonEnv<HmacSecrets>("HMAC_SECRETS");
  }
  return cachedHmacSecrets as HmacSecrets;
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

function validateHmacSignature(
  method: string,
  path: string,
  timestamp: string,
  body: string,
  signature: string,
  clientId: string,
): boolean {
  const secrets = getHmacSecrets();
  const clientSecret = secrets[clientId];

  if (!clientSecret) {
    return false;
  }

  const timestampNum = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestampNum) > HMAC_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const bodyHash = sha256(body || "");
  const canonicalString = [method, path, timestamp, bodyHash].join("\n");
  const expectedSignature = hmacSha256(clientSecret, canonicalString);

  return secureCompare(signature, expectedSignature);
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
    // If API key is provided but invalid, reject immediately (don't fall back to HMAC)
    const source = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    trackAuthFailure(source);
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid API key",
      },
    });
    return;
  }

  const clientId = req.headers["x-client-id"] as string | undefined;
  const timestamp = req.headers["x-timestamp"] as string | undefined;
  const signature = req.headers["x-signature"] as string | undefined;

  if (clientId && timestamp && signature) {
    const rawBody = (req as Request & { rawBody?: string }).rawBody || "";
    const isValid = validateHmacSignature(
      req.method,
      req.path,
      timestamp,
      rawBody,
      signature,
      clientId,
    );

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
      message: "Invalid or missing authentication",
    },
  });
}

export function captureRawBody(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  let data = "";
  req.on("data", (chunk: Buffer) => {
    data += chunk.toString();
  });
  req.on("end", () => {
    (req as Request & { rawBody: string }).rawBody = data;
    next();
  });
}
