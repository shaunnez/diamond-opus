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

import {
  CONSOLIDATOR_BATCH_SIZE,
  CONSOLIDATOR_CONCURRENCY,
  createLogger,
  type ConsolidateMessage,
  type Watermark,
  type Logger,
} from '@diamond/shared';
import {
  getUnconsolidatedRawDiamonds,
  markAsConsolidated,
  upsertDiamond,
  completeRun,
  getRunMetadata,
  closePool,
} from '@diamond/database';
import { mapRawPayloadToDiamond } from '@diamond/nivoda';
import { PricingEngine } from '@diamond/pricing-engine';
import { receiveConsolidateMessage, closeConnections } from './service-bus.js';
import { saveWatermark } from './watermark.js';
import { sendAlert } from './alerts.js';

const baseLogger = createLogger({ service: 'consolidator' });

interface ProcessResult {
  id: string;
  success: boolean;
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

async function processConsolidation(
  message: ConsolidateMessage,
  log: Logger
): Promise<void> {
  log.info('Starting consolidation', { concurrency: CONSOLIDATOR_CONCURRENCY });

  const pricingEngine = new PricingEngine();
  await pricingEngine.loadRules();
  log.info('Pricing rules loaded');

  let totalProcessed = 0;
  let totalErrors = 0;
  let offset = 0;

  while (true) {
    const rawDiamonds = await getUnconsolidatedRawDiamonds(
      CONSOLIDATOR_BATCH_SIZE,
      offset
    );

    if (rawDiamonds.length === 0) {
      break;
    }

    log.debug('Processing batch', { batchSize: rawDiamonds.length });

    const results = await processWithConcurrency(
      rawDiamonds,
      async (rawDiamond): Promise<ProcessResult> => {
        try {
          const baseDiamond = mapRawPayloadToDiamond(rawDiamond.payload);
          const pricedDiamond = pricingEngine.applyPricing(baseDiamond);
          await upsertDiamond(pricedDiamond);
          return { id: rawDiamond.id, success: true };
        } catch (error) {
          // Extract only the error message to avoid logging large payloads
          const errorMsg = error instanceof Error ? error.message : String(error);
          log.error('Error processing raw diamond', {
            rawDiamondId: rawDiamond.id,
            errorType: error instanceof Error ? error.name : 'unknown',
            errorMessage: errorMsg,
          });
          return { id: rawDiamond.id, success: false };
        }
      },
      CONSOLIDATOR_CONCURRENCY
    );

    const processedIds = results.filter((r) => r.success).map((r) => r.id);
    const errorCount = results.filter((r) => !r.success).length;

    totalProcessed += processedIds.length;
    totalErrors += errorCount;

    if (processedIds.length > 0) {
      await markAsConsolidated(processedIds);
    }

    log.info('Batch processed', {
      totalProcessed,
      totalErrors,
      batchProcessed: processedIds.length,
      batchErrors: errorCount,
    });

    if (rawDiamonds.length < CONSOLIDATOR_BATCH_SIZE) {
      break;
    }
  }

  log.info('Consolidation completed', { totalProcessed, totalErrors });

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
    log.error('Consolidation failed', error);

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
