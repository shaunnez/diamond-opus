import { describe, it, expect, afterEach } from 'vitest';
import { TokenBucketRateLimiter } from '../src/middleware/rateLimiter.js';

/**
 * Performance tests for the rate limiter.
 *
 * Simulates realistic worker scenarios to measure throughput, queue depth,
 * and 429 rates at different worker counts against a 15 req/s limit.
 */

interface SimResult {
  totalRequests: number;
  succeeded: number;
  rejected: number;
  durationMs: number;
  actualRps: number;
  peakQueueDepth: number;
  avgWaitMs: number;
  p99WaitMs: number;
}

/**
 * Simulates N workers each making sequential requests with a delay between them
 * (mimicking desync + Nivoda response time). Returns throughput/rejection stats.
 */
async function simulateWorkers(opts: {
  workerCount: number;
  requestsPerWorker: number;
  /** Simulated round-trip time per request in ms (desync + API response + processing) */
  workerDelayMs: number;
  maxRequestsPerWindow: number;
  windowMs: number;
  maxWaitMs: number;
}): Promise<SimResult> {
  const limiter = new TokenBucketRateLimiter({
    maxRequestsPerWindow: opts.maxRequestsPerWindow,
    windowMs: opts.windowMs,
    maxWaitMs: opts.maxWaitMs,
  });

  let succeeded = 0;
  let rejected = 0;
  let peakQueueDepth = 0;
  const waitTimes: number[] = [];

  const queueMonitor = setInterval(() => {
    if (limiter.queueDepth > peakQueueDepth) {
      peakQueueDepth = limiter.queueDepth;
    }
  }, 10);

  const start = Date.now();

  const workers = Array.from({ length: opts.workerCount }, async () => {
    for (let i = 0; i < opts.requestsPerWorker; i++) {
      const reqStart = Date.now();
      try {
        await limiter.acquire();
        const waitMs = Date.now() - reqStart;
        waitTimes.push(waitMs);
        succeeded++;
      } catch {
        rejected++;
      }
      // Simulate time spent processing the response before next request
      await new Promise((r) => setTimeout(r, opts.workerDelayMs));
    }
  });

  await Promise.all(workers);
  const durationMs = Date.now() - start;

  clearInterval(queueMonitor);
  limiter.destroy();

  waitTimes.sort((a, b) => a - b);
  const avgWaitMs = waitTimes.length > 0
    ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
    : 0;
  const p99WaitMs = waitTimes.length > 0
    ? waitTimes[Math.floor(waitTimes.length * 0.99)]
    : 0;

  return {
    totalRequests: opts.workerCount * opts.requestsPerWorker,
    succeeded,
    rejected,
    durationMs,
    actualRps: succeeded / (durationMs / 1000),
    peakQueueDepth,
    avgWaitMs,
    p99WaitMs,
  };
}

function printResult(label: string, r: SimResult) {
  console.log(`\n--- ${label} ---`);
  console.log(`  Workers total requests: ${r.totalRequests}`);
  console.log(`  Succeeded: ${r.succeeded}, Rejected (429): ${r.rejected}`);
  console.log(`  Duration: ${r.durationMs}ms`);
  console.log(`  Actual throughput: ${r.actualRps.toFixed(1)} req/s`);
  console.log(`  Peak queue depth: ${r.peakQueueDepth}`);
  console.log(`  Avg wait: ${r.avgWaitMs.toFixed(1)}ms, P99 wait: ${r.p99WaitMs}ms`);
  console.log(`  Rejection rate: ${((r.rejected / r.totalRequests) * 100).toFixed(1)}%`);
}

describe('Rate limiter performance', () => {
  // Use short windows (100ms = 10 windows/sec) to keep tests fast.
  // Scale maxRequestsPerWindow proportionally: 15 req/1000ms = 1.5 req/100ms -> use 2.
  // This preserves the ratio while keeping test duration reasonable.

  const RATE_LIMIT = 15;
  const WINDOW_MS = 1000;
  const MAX_WAIT_MS = 60_000;

  describe('simulated worker scenarios (realistic timing)', () => {
    // Each worker does sequential requests with ~2s round trip (desync + API + processing).
    // We use 200ms delay + 100ms window to compress time by 10x for faster tests.
    // Real: 2000ms delay, 1000ms window. Test: 200ms delay, 100ms window.

    const COMPRESSED_WINDOW = 100;
    const COMPRESSED_DELAY = 200;
    const COMPRESSED_RATE = 2; // 15 req/s at 1s window ≈ 2 req per 100ms window
    const REQUESTS_PER_WORKER = 10;

    it('10 workers — well under limit, zero 429s', async () => {
      const result = await simulateWorkers({
        workerCount: 10,
        requestsPerWorker: REQUESTS_PER_WORKER,
        workerDelayMs: COMPRESSED_DELAY,
        maxRequestsPerWindow: COMPRESSED_RATE,
        windowMs: COMPRESSED_WINDOW,
        maxWaitMs: 30_000,
      });
      printResult('10 workers (compressed)', result);

      expect(result.rejected).toBe(0);
      expect(result.succeeded).toBe(100);
    }, 30_000);

    it('20 workers — near limit, minimal 429s', async () => {
      const result = await simulateWorkers({
        workerCount: 20,
        requestsPerWorker: REQUESTS_PER_WORKER,
        workerDelayMs: COMPRESSED_DELAY,
        maxRequestsPerWindow: COMPRESSED_RATE,
        windowMs: COMPRESSED_WINDOW,
        maxWaitMs: 30_000,
      });
      printResult('20 workers (compressed)', result);

      // Should mostly succeed — some queuing but within maxWaitMs
      expect(result.rejected).toBe(0);
      expect(result.succeeded).toBe(200);
    }, 30_000);

    it('40 workers — over limit, queuing expected', async () => {
      const result = await simulateWorkers({
        workerCount: 40,
        requestsPerWorker: REQUESTS_PER_WORKER,
        workerDelayMs: COMPRESSED_DELAY,
        maxRequestsPerWindow: COMPRESSED_RATE,
        windowMs: COMPRESSED_WINDOW,
        maxWaitMs: 30_000,
      });
      printResult('40 workers (compressed)', result);

      // All should still succeed because maxWaitMs is generous,
      // but queue depth and wait times will be significant
      expect(result.succeeded).toBe(400);
      expect(result.rejected).toBe(0);
      expect(result.peakQueueDepth).toBeGreaterThan(0);
      console.log(`  >> With 40 workers, avg wait was ${result.avgWaitMs.toFixed(0)}ms (compressed)`);
      console.log(`  >> Real-world equivalent: ~${(result.avgWaitMs * 10).toFixed(0)}ms avg wait`);
    }, 60_000);

    it('60 workers — significantly over limit', async () => {
      const result = await simulateWorkers({
        workerCount: 60,
        requestsPerWorker: REQUESTS_PER_WORKER,
        workerDelayMs: COMPRESSED_DELAY,
        maxRequestsPerWindow: COMPRESSED_RATE,
        windowMs: COMPRESSED_WINDOW,
        maxWaitMs: 30_000,
      });
      printResult('60 workers (compressed)', result);

      expect(result.succeeded + result.rejected).toBe(600);
      expect(result.peakQueueDepth).toBeGreaterThan(0);
      console.log(`  >> With 60 workers, p99 wait was ${result.p99WaitMs}ms (compressed)`);
      console.log(`  >> Real-world equivalent: ~${result.p99WaitMs * 10}ms p99 wait`);
    }, 60_000);
  });

  describe('real-time rate limit accuracy', () => {
    it('throughput does not exceed configured rate', async () => {
      // Fire as fast as possible for 3 seconds and verify actual throughput ≤ limit
      const limiter = new TokenBucketRateLimiter({
        maxRequestsPerWindow: RATE_LIMIT,
        windowMs: WINDOW_MS,
        maxWaitMs: MAX_WAIT_MS,
      });

      const testDurationMs = 3000;
      let succeeded = 0;
      const start = Date.now();

      // Hammer with 50 concurrent "workers" all acquiring as fast as they can
      const hammer = Array.from({ length: 50 }, async () => {
        while (Date.now() - start < testDurationMs) {
          try {
            await limiter.acquire();
            succeeded++;
          } catch {
            // 429 — stop this worker
            break;
          }
        }
      });

      await Promise.all(hammer);
      const elapsed = Date.now() - start;
      limiter.destroy();

      const actualRps = succeeded / (elapsed / 1000);
      console.log(`\n--- Throughput cap test ---`);
      console.log(`  Succeeded: ${succeeded} in ${elapsed}ms`);
      console.log(`  Actual: ${actualRps.toFixed(1)} req/s, Limit: ${RATE_LIMIT} req/s`);

      // Allow some tolerance for window boundary effects
      expect(actualRps).toBeLessThanOrEqual(RATE_LIMIT * 1.2);
      expect(actualRps).toBeGreaterThanOrEqual(RATE_LIMIT * 0.7);
    }, 15_000);
  });

  describe('429 rejection scenarios', () => {
    it('short maxWaitMs causes rejections under load', async () => {
      // Simulate what happens with 40 workers but only 5s maxWaitMs
      const result = await simulateWorkers({
        workerCount: 40,
        requestsPerWorker: 5,
        workerDelayMs: 50,
        maxRequestsPerWindow: 2,
        windowMs: 100,
        maxWaitMs: 500, // Short timeout — will cause 429s
      });
      printResult('40 workers, short maxWaitMs', result);

      expect(result.rejected).toBeGreaterThan(0);
      console.log(`  >> ${result.rejected} requests got 429 due to short maxWaitMs`);
    }, 30_000);

    it('generous maxWaitMs absorbs burst with queuing', async () => {
      const result = await simulateWorkers({
        workerCount: 40,
        requestsPerWorker: 5,
        workerDelayMs: 50,
        maxRequestsPerWindow: 2,
        windowMs: 100,
        maxWaitMs: 60_000, // Generous timeout
      });
      printResult('40 workers, generous maxWaitMs', result);

      expect(result.rejected).toBe(0);
      expect(result.peakQueueDepth).toBeGreaterThan(0);
    }, 60_000);
  });
});
