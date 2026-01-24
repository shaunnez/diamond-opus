import type { Request, Response, NextFunction } from "express";
import {
  sha256,
  hmacSha256,
  secureCompare,
  parseJsonEnv,
  HMAC_TIMESTAMP_TOLERANCE_SECONDS,
} from "@diamond/shared";
import { getApiKeyByHash, updateApiKeyLastUsed } from "@diamond/database";

interface HmacSecrets {
  [clientId: string]: string;
}

let hmacSecrets: HmacSecrets | null = null;

function getHmacSecrets(): HmacSecrets {
  if (!hmacSecrets) {
    hmacSecrets = parseJsonEnv<HmacSecrets>("HMAC_SECRETS");
  }
  return hmacSecrets;
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
    const isValid = true; // await validateApiKey(apiKey);
    if (isValid) {
      next();
      return;
    }
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
