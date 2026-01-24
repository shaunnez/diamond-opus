import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');

config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

import {
  CONSOLIDATOR_BATCH_SIZE,
  type ConsolidateMessage,
  type Watermark,
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

async function processConsolidation(message: ConsolidateMessage): Promise<void> {
  console.log(`Starting consolidation for run ${message.runId}`);

  const pricingEngine = new PricingEngine();
  await pricingEngine.loadRules();
  console.log('Pricing rules loaded');

  let totalProcessed = 0;
  let offset = 0;

  while (true) {
    const rawDiamonds = await getUnconsolidatedRawDiamonds(
      CONSOLIDATOR_BATCH_SIZE,
      offset
    );

    if (rawDiamonds.length === 0) {
      break;
    }

    console.log(`Processing batch of ${rawDiamonds.length} raw diamonds`);

    const processedIds: string[] = [];

    for (const rawDiamond of rawDiamonds) {
      try {
        const baseDiamond = mapRawPayloadToDiamond(rawDiamond.payload);

        const pricedDiamond = pricingEngine.applyPricing(baseDiamond);

        await upsertDiamond(pricedDiamond);

        processedIds.push(rawDiamond.id);
        totalProcessed++;
      } catch (error) {
        console.error(
          `Error processing raw diamond ${rawDiamond.id}:`,
          error
        );
      }
    }

    if (processedIds.length > 0) {
      await markAsConsolidated(processedIds);
    }

    console.log(`Processed ${totalProcessed} diamonds so far`);

    if (rawDiamonds.length < CONSOLIDATOR_BATCH_SIZE) {
      break;
    }
  }

  console.log(`Consolidation completed. Total processed: ${totalProcessed}`);

  const now = new Date();
  await completeRun(message.runId, now);

  const watermark: Watermark = {
    lastUpdatedAt: now.toISOString(),
    lastRunId: message.runId,
    lastRunCompletedAt: now.toISOString(),
  };
  await saveWatermark(watermark);

  console.log('Watermark advanced');
}

async function handleConsolidateMessage(
  message: ConsolidateMessage
): Promise<void> {
  const runMetadata = await getRunMetadata(message.runId);

  if (!runMetadata) {
    console.error(`Run ${message.runId} not found`);
    return;
  }

  if (runMetadata.failedWorkers > 0) {
    console.error(
      `Run ${message.runId} has ${runMetadata.failedWorkers} failed workers, skipping consolidation`
    );
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
    await processConsolidation(message);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Consolidation failed:', errorMessage);

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
  console.log('Consolidator starting...');

  while (true) {
    const received = await receiveConsolidateMessage();

    if (!received) {
      console.log('No consolidate messages, waiting...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    try {
      await handleConsolidateMessage(received.message);
      await received.complete();
    } catch (error) {
      console.error('Error processing consolidate message:', error);
      await received.abandon();
    }
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error('Consolidator failed:', error);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down...');
  await closeConnections();
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down...');
  await closeConnections();
  await closePool();
  process.exit(0);
});

main();
