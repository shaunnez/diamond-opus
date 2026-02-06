import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../../..');

config({ path: resolve(rootDir, '.env.local') });
config({ path: resolve(rootDir, '.env') });

import {
  createLogger,
  type WorkItemMessage,
} from '@diamond/shared';
import {
  getRunMetadata,
  getFailedWorkerRuns,
  resetFailedWorker,
  getPartitionProgress,
  closePool,
} from '@diamond/database';
import { sendWorkItem, closeConnections } from './service-bus.js';

const logger = createLogger({ service: 'worker-retry' });

function printUsage(): void {
  console.log(`
Worker Retry CLI

Usage:
  npm run worker:retry -- <command> <runId> [options]

Commands:
  list <runId>              List failed workers for a run
  retry <runId>             Retry all failed workers for a run
  retry <runId> <partition> Retry a specific failed worker partition

Examples:
  npm run worker:retry -- list abc-123-def
  npm run worker:retry -- retry abc-123-def
  npm run worker:retry -- retry abc-123-def partition-0
`);
}

async function listFailedWorkers(runId: string): Promise<void> {
  const log = logger.child({ runId });

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

  const failedWorkers = await getFailedWorkerRuns(runId);

  if (failedWorkers.length === 0) {
    log.info('No failed workers found');
    return;
  }

  console.log('\nFailed Workers:');
  console.log('---------------');
  for (const worker of failedWorkers) {
    console.log(`  Partition: ${worker.partitionId}`);
    console.log(`    Status: ${worker.status}`);
    console.log(`    Error: ${worker.errorMessage ?? 'N/A'}`);
    console.log(`    Records Processed: ${worker.recordsProcessed}`);
    console.log(`    Has Payload: ${worker.workItemPayload ? 'Yes' : 'No'}`);
    console.log('');
  }
}

async function retryFailedWorkers(runId: string, partitionId?: string): Promise<void> {
  const log = logger.child({ runId, partitionId });

  const runMetadata = await getRunMetadata(runId);
  if (!runMetadata) {
    log.error('Run not found');
    process.exitCode = 1;
    return;
  }

  const failedWorkers = await getFailedWorkerRuns(runId);

  if (failedWorkers.length === 0) {
    log.info('No failed workers found');
    return;
  }

  const workersToRetry = partitionId
    ? failedWorkers.filter((w) => w.partitionId === partitionId)
    : failedWorkers;

  if (workersToRetry.length === 0) {
    log.error('No matching failed workers found', { partitionId });
    process.exitCode = 1;
    return;
  }

  log.info('Retrying failed workers', { count: workersToRetry.length });

  for (const worker of workersToRetry) {
    if (!worker.workItemPayload) {
      log.error('Worker has no stored payload, cannot retry', {
        partitionId: worker.partitionId,
      });
      continue;
    }

    const workItem = worker.workItemPayload as unknown as WorkItemMessage;

    // Get partition progress to resume from correct offset
    const progress = await getPartitionProgress(runId, worker.partitionId);
    workItem.offset = progress.nextOffset;

    log.info('Re-queuing work item', {
      partitionId: worker.partitionId,
      minPrice: workItem.minPrice,
      maxPrice: workItem.maxPrice,
      totalRecords: workItem.totalRecords,
      resumeOffset: workItem.offset,
    });

    // Reset the worker status in the database
    // (clears failed flag, preserves next_offset)
    await resetFailedWorker(runId, worker.partitionId);

    // Re-queue the work item with the correct resume offset
    await sendWorkItem(workItem);

    log.info('Work item re-queued successfully', { partitionId: worker.partitionId });
  }

  log.info('All specified workers have been re-queued');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const command = args[0];
  const runId = args[1];
  const partitionId = args[2];

  try {
    switch (command) {
      case 'list':
        await listFailedWorkers(runId!);
        break;
      case 'retry':
        await retryFailedWorkers(runId!, partitionId);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exitCode = 1;
    }
  } catch (error) {
    logger.error('Command failed', error);
    process.exitCode = 1;
  } finally {
    await closeConnections();
    await closePool();
  }
}

main();
