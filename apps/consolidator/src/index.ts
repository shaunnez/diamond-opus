import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');

config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

import {
  CONSOLIDATOR_BATCH_SIZE,
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

async function processConsolidation(
  message: ConsolidateMessage,
  log: Logger
): Promise<void> {
  log.info('Starting consolidation');

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

    const processedIds: string[] = [];

    for (const rawDiamond of rawDiamonds) {
      try {
        const baseDiamond = mapRawPayloadToDiamond(rawDiamond.payload);

        const pricedDiamond = pricingEngine.applyPricing(baseDiamond);

        await upsertDiamond(pricedDiamond);

        processedIds.push(rawDiamond.id);
        totalProcessed++;
      } catch (error) {
        totalErrors++;
        log.error('Error processing raw diamond', error, {
          rawDiamondId: rawDiamond.id,
        });
      }
    }

    if (processedIds.length > 0) {
      await markAsConsolidated(processedIds);
    }

    log.info('Batch processed', {
      totalProcessed,
      totalErrors,
      batchProcessed: processedIds.length,
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

  if (runMetadata.failedWorkers > 0) {
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
