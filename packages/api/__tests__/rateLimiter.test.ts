import { describe, it, expect, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '../src/middleware/rateLimiter.js';

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter;

  afterEach(() => {
    limiter?.destroy();
  });

  it('allows requests up to the limit', async () => {
    limiter = new TokenBucketRateLimiter({
      maxRequestsPerWindow: 3,
      windowMs: 1000,
      maxWaitMs: 100,
    });

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(limiter.queueDepth).toBe(0);
  });

  it('queues requests that exceed the limit', async () => {
    limiter = new TokenBucketRateLimiter({
      maxRequestsPerWindow: 2,
      windowMs: 100,
      maxWaitMs: 5000,
    });

    // Consume all tokens
    await limiter.acquire();
    await limiter.acquire();

    // Third request should be queued, then resolve in next window
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    // Should have waited roughly one window cycle
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(500);
  });

  it('rejects after maxWaitMs is exceeded', async () => {
    limiter = new TokenBucketRateLimiter({
      maxRequestsPerWindow: 1,
      windowMs: 5000, // Very long window
      maxWaitMs: 200,  // Short wait
    });

    await limiter.acquire();

    // Next request should timeout
    await expect(limiter.acquire()).rejects.toThrow('Rate limit wait timeout');
  });

  it('resets window after windowMs and allows new requests', async () => {
    limiter = new TokenBucketRateLimiter({
      maxRequestsPerWindow: 1,
      windowMs: 100,
      maxWaitMs: 5000,
    });

    await limiter.acquire();

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 120));

    // Should succeed in the new window
    await limiter.acquire();
  });

  it('drains multiple queued requests across windows', async () => {
    limiter = new TokenBucketRateLimiter({
      maxRequestsPerWindow: 2,
      windowMs: 100,
      maxWaitMs: 5000,
    });

    // Consume all tokens
    await limiter.acquire();
    await limiter.acquire();

    // Queue 3 more — should drain across 2 windows
    const results = await Promise.all([
      limiter.acquire(),
      limiter.acquire(),
      limiter.acquire(),
    ]);

    expect(results).toHaveLength(3);
  });

  it('reports queue depth correctly', async () => {
    limiter = new TokenBucketRateLimiter({
      maxRequestsPerWindow: 1,
      windowMs: 200,
      maxWaitMs: 5000,
    });

    await limiter.acquire();

    // Queue two requests (don't await yet)
    const p1 = limiter.acquire();
    const p2 = limiter.acquire();

    expect(limiter.queueDepth).toBe(2);

    // Let them drain
    await Promise.all([p1, p2]);
    expect(limiter.queueDepth).toBe(0);
  });

  it('destroy rejects queued requests', async () => {
    limiter = new TokenBucketRateLimiter({
      maxRequestsPerWindow: 1,
      windowMs: 10000,
      maxWaitMs: 10000,
    });

    await limiter.acquire();

    const promise = limiter.acquire();
    limiter.destroy();

    await expect(promise).rejects.toThrow('Rate limiter destroyed');
  });
});
