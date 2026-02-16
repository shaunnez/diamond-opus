import type { Request, Response, NextFunction } from "express";
import { createServiceLogger } from "../utils/logger.js";

const logger = createServiceLogger('shared', { component: 'rate-limiter' });

export interface RateLimiterConfig {
  /** Maximum requests per window per replica (default: 50) */
  maxRequestsPerWindow: number;
  /** Window duration in milliseconds (default: 1000) */
  windowMs: number;
  /** Maximum time a queued request waits before receiving 429 (default: 60000) */
  maxWaitMs: number;
}

interface QueuedRequest {
  resolve: () => void;
  reject: (reason: Error) => void;
  enqueuedAt: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * In-memory fixed-window rate limiter with FIFO queuing.
 *
 * When the rate limit is exceeded, requests are queued and drained as tokens
 * become available in subsequent windows. If a request waits longer than
 * maxWaitMs it receives a 429 response.
 *
 * Each API replica maintains its own independent counter — set the per-replica
 * limit to `target_global / num_replicas` when running multiple replicas.
 */
export class TokenBucketRateLimiter {
  private windowStart: number;
  private requestCount: number;
  private readonly queue: QueuedRequest[] = [];
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly config: RateLimiterConfig) {
    this.windowStart = Date.now();
    this.requestCount = 0;
  }

  /**
   * Try to acquire a token. If the current window has capacity, returns immediately.
   * Otherwise queues the request until a token is available or maxWaitMs elapses.
   */
  async acquire(): Promise<void> {
    this.maybeResetWindow();

    if (this.requestCount < this.config.maxRequestsPerWindow) {
      this.requestCount++;
      return;
    }

    // Window exhausted — queue the request with a per-request timeout
    return new Promise<void>((resolve, reject) => {
      const item: QueuedRequest = {
        resolve,
        reject,
        enqueuedAt: Date.now(),
        timer: setTimeout(() => {
          const idx = this.queue.indexOf(item);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(new Error("Rate limit wait timeout"));
          }
        }, this.config.maxWaitMs),
      };
      this.queue.push(item);
      this.ensureDrainTimer();
    });
  }

  /** Number of requests currently queued waiting for a token. */
  get queueDepth(): number {
    return this.queue.length;
  }

  /** Clean up the drain timer (for graceful shutdown / tests). */
  destroy(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    // Reject any remaining queued requests
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      clearTimeout(item.timer);
      item.reject(new Error("Rate limiter destroyed"));
    }
  }

  private maybeResetWindow(): void {
    const now = Date.now();
    if (now - this.windowStart >= this.config.windowMs) {
      this.windowStart = now;
      this.requestCount = 0;
    }
  }

  private ensureDrainTimer(): void {
    if (this.drainTimer) return;

    this.drainTimer = setInterval(() => {
      this.drainQueue();
    }, this.config.windowMs);
  }

  private drainQueue(): void {
    this.maybeResetWindow();

    // Drain as many as the new window allows
    while (this.queue.length > 0 && this.requestCount < this.config.maxRequestsPerWindow) {
      const item = this.queue.shift()!;
      clearTimeout(item.timer);
      this.requestCount++;
      item.resolve();
    }

    // Stop the timer when the queue is empty
    if (this.queue.length === 0 && this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }
}

/**
 * Creates Express middleware that rate-limits requests using an in-memory
 * token bucket. Designed for the Nivoda proxy route.
 */
export function createRateLimiterMiddleware(config: RateLimiterConfig) {
  const limiter = new TokenBucketRateLimiter(config);

  const middleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await limiter.acquire();
      next();
    } catch {
      const traceId = req.header("x-trace-id") ?? "unknown";
      const retryAfterSeconds = Math.ceil(config.windowMs / 1000);

      logger.warn('nivoda_proxy_rate_limited', {
        traceId,
        queueDepth: limiter.queueDepth,
        maxRequestsPerWindow: config.maxRequestsPerWindow,
        windowMs: config.windowMs,
      });

      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error: {
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded, try again shortly",
          traceId,
          retryAfterSeconds,
        },
      });
    }
  };

  // Expose the limiter instance for monitoring/tests
  (middleware as any).limiter = limiter;

  return middleware;
}
