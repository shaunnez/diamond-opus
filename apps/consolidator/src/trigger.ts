import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');

config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

import {
  createLogger,
  generateTraceId,
  type ConsolidateMessage,
} from '@diamond/shared';
import {
  getRunMetadata,
  closePool,
} from '@diamond/database';
import { sendConsolidateMessage, closeConnections } from './service-bus.js';

const logger = createLogger({ service: 'consolidator-trigger' });

function printUsage(): void {
  console.log(`
Consolidation Trigger CLI

Usage:
  npm run consolidator:trigger -- <runId> [options]

Options:
  --force    Force consolidation even if workers failed

Examples:
  npm run consolidator:trigger -- abc-123-def
  npm run consolidator:trigger -- abc-123-def --force
`);
}

async function triggerConsolidation(runId: string, force: boolean): Promise<void> {
  const traceId = generateTraceId();
  const log = logger.child({ runId, traceId });

  log.info('Checking run status');

  const runMetadata = await getRunMetadata(runId);
  if (!runMetadata) {
    log.error('Run not found');
    process.exitCode = 1;
    return;
  }

  log.info('Run metadata', {
    runType: runMetadata.runType,
    expectedWorkers: runMetadata.expectedWorkers,
    completedWorkers: runMetadata.completedWorkers,
    failedWorkers: runMetadata.failedWorkers,
    startedAt: runMetadata.startedAt,
    completedAt: runMetadata.completedAt,
  });

  if (runMetadata.completedAt) {
    log.warn('Run has already completed');
  }

  if (runMetadata.failedWorkers > 0 && !force) {
    log.error('Run has failed workers. Use --force to consolidate anyway', {
      failedWorkers: runMetadata.failedWorkers,
    });
    process.exitCode = 1;
    return;
  }

  if (runMetadata.failedWorkers > 0 && force) {
    log.warn('Forcing consolidation despite failed workers', {
      failedWorkers: runMetadata.failedWorkers,
    });
  }

  const message: ConsolidateMessage = {
    type: 'CONSOLIDATE',
    feed: runMetadata.feed,
    runId,
    traceId,
  };

  // Add force flag to message for the consolidator to respect
  const messageWithForce = {
    ...message,
    force,
  };

  log.info('Sending consolidation message');
  await sendConsolidateMessage(messageWithForce as ConsolidateMessage);
  log.info('Consolidation message sent successfully');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const runId = args[0];
  const force = args.includes('--force');

  try {
    await triggerConsolidation(runId!, force);
  } catch (error) {
    logger.error('Trigger failed', error);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

main();
