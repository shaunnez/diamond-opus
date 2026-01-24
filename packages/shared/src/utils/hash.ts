import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function hmacSha256(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
