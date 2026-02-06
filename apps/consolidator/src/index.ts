// Only load dotenv in development - production uses container env vars
if (process.env.NODE_ENV !== 'production') {
  const { config } = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const rootDir = resolve(__dirname, '../../..');

  config({ path: resolve(rootDir, '.env.local') });
  config({ path: resolve(rootDir, '.env') });
}

import { randomUUID } from 'node:crypto';
import {
  CONSOLIDATOR_BATCH_SIZE,
  CONSOLIDATOR_UPSERT_BATCH_SIZE,
  CONSOLIDATOR_CONCURRENCY,
  CONSOLIDATOR_CLAIM_TTL_MINUTES,
  createLogger,
  type ConsolidateMessage,
  type Watermark,
  type Logger,
} from '@diamond/shared';
import {
  claimUnconsolidatedRawDiamonds,
  resetStuckClaims,
  markAsConsolidated,
  markAsFailed,
  upsertDiamondsBatch,
  completeRun,
  getRunMetadata,
  markConsolidationStarted,
  updateRunConsolidationStats,
  insertErrorLog,
  closePool,
  type DiamondInput,
  type ClaimedRawDiamond,
} from '@diamond/database';
import { mapRawPayloadToDiamond } from '@diamond/nivoda';
import { PricingEngine } from '@diamond/pricing-engine';
import { receiveConsolidateMessage, closeConnections } from './service-bus.js';
import { saveWatermark } from './watermark.js';
import { sendAlert } from './alerts.js';

const baseLogger = createLogger({ service: 'consolidator' });

// Stable instance ID for this consolidator process - used to track claim ownership
const CONSOLIDATOR_INSTANCE_ID = randomUUID();

interface BatchResult {
  processedIds: string[];
  failedIds: string[];
  errorCount: number;
}

async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      if (item !== undefined) {
        results[currentIndex] = await processor(item);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * Splits an array into chunks of the specified size.
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Process a batch of raw diamonds: map, price, and batch upsert.
 * Returns the IDs that were successfully processed and error count.
 */
async function processBatch(
  rawDiamonds: ClaimedRawDiamond[],
  pricingEngine: PricingEngine,
  log: Logger
): Promise<BatchResult> {
  const processedIds: string[] = [];
  const failedIds: string[] = [];
  const diamonds: DiamondInput[] = [];
  let errorCount = 0;

  // Phase 1: Map and price all diamonds (CPU-bound, fast)
  for (const rawDiamond of rawDiamonds) {
    try {
      const baseDiamond = mapRawPayloadToDiamond(rawDiamond.payload);
      const pricedDiamond = pricingEngine.applyPricing(baseDiamond);
      diamonds.push(pricedDiamond);
      processedIds.push(rawDiamond.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      log.error('Error mapping raw diamond', error, {
        rawDiamondId: rawDiamond.id,
      });
      insertErrorLog('consolidator', msg, stack, { rawDiamondId: rawDiamond.id }).catch(() => {});
      failedIds.push(rawDiamond.id);
      errorCount++;
    }
  }

  // Phase 2: Batch upsert to database
  if (diamonds.length > 0) {
    try {
      await upsertDiamondsBatch(diamonds);
    } catch (error) {
      // If batch fails, all diamonds in this batch are considered failed
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      log.error('Batch upsert failed', error, {
        batchSize: diamonds.length,
      });
      insertErrorLog('consolidator', msg, stack, { batchSize: diamonds.length }).catch(() => {});
      const allIds = rawDiamonds.map((d) => d.id);
      return { processedIds: [], failedIds: allIds, errorCount: rawDiamonds.length };
    }
  }

  return { processedIds, failedIds, errorCount };
}

async function processConsolidation(
  message: ConsolidateMessage,
  log: Logger
): Promise<void> {
  log.info('Starting consolidation', {
    instanceId: CONSOLIDATOR_INSTANCE_ID,
    concurrency: CONSOLIDATOR_CONCURRENCY,
    batchSize: CONSOLIDATOR_BATCH_SIZE,
    upsertBatchSize: CONSOLIDATOR_UPSERT_BATCH_SIZE,
  });

  // Record that consolidation has started for this run
  await markConsolidationStarted(message.runId);

  // Reset any stuck claims from crashed/timed out consolidators
  const resetCount = await resetStuckClaims(CONSOLIDATOR_CLAIM_TTL_MINUTES);
  if (resetCount > 0) {
    log.info('Reset stuck claims', { count: resetCount, ttlMinutes: CONSOLIDATOR_CLAIM_TTL_MINUTES });
  }

  const pricingEngine = new PricingEngine();
  await pricingEngine.loadRules();
  log.info('Pricing rules loaded');

  let totalProcessed = 0;
  let totalErrors = 0;
  let totalClaimed = 0;

  while (true) {
    // Claim batch exclusively - prevents duplicate processing across replicas
    const rawDiamonds = await claimUnconsolidatedRawDiamonds(
      CONSOLIDATOR_BATCH_SIZE,
      CONSOLIDATOR_INSTANCE_ID
    );

    if (rawDiamonds.length === 0) {
      break;
    }

    totalClaimed += rawDiamonds.length;
    log.debug('Fetched batch', { batchSize: rawDiamonds.length });

    // Split into smaller chunks for batch upserts
    const chunks = chunkArray(rawDiamonds, CONSOLIDATOR_UPSERT_BATCH_SIZE);

    // Process chunks concurrently (respects connection pool limits)
    const results = await processWithConcurrency(
      chunks,
      (chunk) => processBatch(chunk, pricingEngine, log),
      CONSOLIDATOR_CONCURRENCY
    );

    // Aggregate results
    const allProcessedIds = results.flatMap((r) => r.processedIds);
    const allFailedIds = results.flatMap((r) => r.failedIds);
    const batchErrors = results.reduce((sum, r) => sum + r.errorCount, 0);

    totalProcessed += allProcessedIds.length;
    totalErrors += batchErrors;

    // Mark successfully processed diamonds as consolidated
    if (allProcessedIds.length > 0) {
      await markAsConsolidated(allProcessedIds);
    }

    // Mark failed diamonds explicitly so they don't stay stuck in 'processing'
    if (allFailedIds.length > 0) {
      await markAsFailed(allFailedIds);
    }

    log.info('Batch processed', {
      totalProcessed,
      totalErrors,
      batchProcessed: allProcessedIds.length,
      batchFailed: allFailedIds.length,
      batchErrors,
      chunks: chunks.length,
    });

    // If we got fewer than requested, we've processed everything
    if (rawDiamonds.length < CONSOLIDATOR_BATCH_SIZE) {
      break;
    }
  }

  // Record consolidation outcome
  await updateRunConsolidationStats(message.runId, {
    processed: totalProcessed,
    errors: totalErrors,
    total: totalClaimed,
  });

  log.info('Consolidation completed', { totalProcessed, totalErrors, totalClaimed });

  const now = new Date();
  await completeRun(message.runId, now);

  const watermark: Watermark = {
    lastUpdatedAt: now.toISOString(),
    lastRunId: message.runId,
    lastRunCompletedAt: now.toISOString(),
  };
  await saveWatermark(watermark);

  log.info('Watermark advanced', { watermark });
}

async function handleConsolidateMessage(
  message: ConsolidateMessage
): Promise<void> {
  const log = baseLogger.child({
    runId: message.runId,
    traceId: message.traceId,
  });

  log.info('Received consolidate message');

  const runMetadata = await getRunMetadata(message.runId);

  if (!runMetadata) {
    log.error('Run not found');
    return;
  }

  if (runMetadata.failedWorkers > 0 && !message.force) {
    log.error('Workers failed, skipping consolidation', {
      failedWorkers: runMetadata.failedWorkers,
      expectedWorkers: runMetadata.expectedWorkers,
      completedWorkers: runMetadata.completedWorkers,
    });
    await sendAlert(
      'Consolidation Skipped',
      `Run ${message.runId} was not consolidated because ${runMetadata.failedWorkers} worker(s) failed.\n\n` +
        `Expected workers: ${runMetadata.expectedWorkers}\n` +
        `Completed workers: ${runMetadata.completedWorkers}\n` +
        `Failed workers: ${runMetadata.failedWorkers}`
    );
    return;
  }

  if (runMetadata.failedWorkers > 0 && message.force) {
    log.warn('Force consolidation enabled, proceeding despite failed workers', {
      failedWorkers: runMetadata.failedWorkers,
      expectedWorkers: runMetadata.expectedWorkers,
      completedWorkers: runMetadata.completedWorkers,
    });
  }

  try {
    await processConsolidation(message, log);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error('Consolidation failed', error);

    insertErrorLog('consolidator', errorMessage, errorStack, {
      runId: message.runId,
      traceId: message.traceId,
    }).catch(() => {});

    await sendAlert(
      'Consolidation Failed',
      `Run ${message.runId} consolidation failed.\n\n` +
        `Error: ${errorMessage}\n\n` +
        'Watermark was NOT advanced. Manual intervention may be required.'
    );

    throw error;
  }
}

async function run(): Promise<void> {
  baseLogger.info('Consolidator starting');

  while (true) {
    const received = await receiveConsolidateMessage();

    if (!received) {
      baseLogger.debug('No consolidate messages, waiting');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    try {
      await handleConsolidateMessage(received.message);
      await received.complete();
    } catch (error) {
      baseLogger.error('Error processing consolidate message', error);
      await received.abandon();
    }
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    baseLogger.error('Consolidator failed', error);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

process.on('SIGTERM', async () => {
  baseLogger.info('Received SIGTERM, shutting down');
  await closeConnections();
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  baseLogger.info('Received SIGINT, shutting down');
  await closeConnections();
  await closePool();
  process.exit(0);
});

main();
