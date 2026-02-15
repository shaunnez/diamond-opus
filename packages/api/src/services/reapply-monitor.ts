/**
 * Reapply Job Monitoring Service
 *
 * Automatically detects stalled jobs and retries failed jobs.
 * Runs periodically on all API replicas (idempotent design).
 *
 * Features:
 * - Stall detection: Jobs with no progress for 15+ minutes marked as failed
 * - Auto-retry: Failed jobs retried up to 3 times with exponential backoff
 * - Multi-replica safe: Atomic state transitions prevent duplicate execution
 */

import {
  findStalledJobs,
  findRetryableJobs,
  markJobsAsStalled,
  getReapplyJob,
} from '@diamond/database';
import {
  REAPPLY_JOB_STALL_THRESHOLD_MINUTES,
  REAPPLY_MAX_RETRIES,
  REAPPLY_MONITOR_INTERVAL_MS,
  createServiceLogger,
} from '@diamond/shared';

const logger = createServiceLogger('api', { component: 'reapply-monitor' });

let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Monitor jobs for stalls and automatic retries.
 * Safe to run on multiple API replicas simultaneously.
 */
async function monitorJobs(): Promise<void> {
  try {
    // Step 1: Detect and mark stalled jobs
    const stalledJobIds = await findStalledJobs(REAPPLY_JOB_STALL_THRESHOLD_MINUTES);

    if (stalledJobIds.length > 0) {
      logger.info('Detected stalled reapply jobs', { stalledJobIds });
      const markedCount = await markJobsAsStalled(stalledJobIds);
      logger.info('Marked stalled jobs as failed', { markedCount });
    }

    // Step 2: Find and retry failed jobs
    const retryableJobs = await findRetryableJobs(REAPPLY_MAX_RETRIES);

    for (const job of retryableJobs) {
      try {
        // Double-check job is still eligible (race condition protection)
        const freshJob = await getReapplyJob(job.id);
        if (!freshJob || freshJob.status !== 'failed') {
          logger.info('Job already picked up by another replica, skipping', { jobId: job.id });
          continue;
        }

        logger.info('Auto-retrying failed reapply job', {
          jobId: job.id,
          retryCount: job.retryCount,
          nextRetryAt: job.nextRetryAt,
        });

        // Dynamic import to avoid circular dependency
        const { executeReapplyJob } = await import('../routes/pricing-rules.js');

        // Fire-and-forget execution (maintains existing architecture)
        executeReapplyJob(job.id, job.retryCount).catch((err) => {
          logger.error('Auto-retry execution failed', { err, jobId: job.id });
        });
      } catch (err) {
        logger.error('Failed to trigger retry for job', { err, jobId: job.id });
      }
    }
  } catch (err) {
    logger.error('Reapply job monitoring cycle failed', { err });
  }
}

/**
 * Initialize the reapply job monitoring service.
 * Starts periodic monitoring on this API replica.
 */
export async function initReapplyMonitor(): Promise<void> {
  if (monitorInterval) {
    logger.warn('Reapply monitor already initialized');
    return;
  }

  logger.info('Initializing reapply job monitor', {
    intervalMs: REAPPLY_MONITOR_INTERVAL_MS,
    stallThresholdMinutes: REAPPLY_JOB_STALL_THRESHOLD_MINUTES,
    maxRetries: REAPPLY_MAX_RETRIES,
  });

  // Run first check immediately
  await monitorJobs();

  // Schedule periodic checks
  monitorInterval = setInterval(() => {
    monitorJobs().catch((err) => {
      logger.error('Unhandled error in monitor interval', { err });
    });
  }, REAPPLY_MONITOR_INTERVAL_MS);

  // Allow process to exit gracefully (don't keep it alive)
  monitorInterval.unref();

  logger.info('Reapply job monitor started');
}

/**
 * Stop the monitoring service gracefully.
 * Called during server shutdown.
 */
export function stopReapplyMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    logger.info('Reapply job monitor stopped');
  }
}
