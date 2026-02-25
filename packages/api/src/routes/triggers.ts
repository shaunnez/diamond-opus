import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ServiceBusClient, ServiceBusSender } from "@azure/service-bus";
import { ContainerAppsAPIClient } from "@azure/arm-appcontainers";
import { DefaultAzureCredential } from "@azure/identity";
import {
  optionalEnv,
  generateTraceId,
  SERVICE_BUS_QUEUES,
  type ConsolidateMessage,
  type WorkItemMessage,
} from "@diamond/shared";
import {
  getRunMetadata,
  getFailedWorkerRuns,
  resetFailedWorker,
  reopenRun,
  getPartitionProgress,
  resetFailedDiamonds,
  cancelRun,
  deleteFailedRun,
} from "@diamond/database";
import { validateBody, badRequest, notFound } from "../middleware/index.js";
import {
  triggerSchedulerSchema,
  triggerConsolidateSchema,
  retryWorkersSchema,
  resumeConsolidateSchema,
  demoSeedSchema,
  cancelRunSchema,
  deleteRunSchema,
  type TriggerSchedulerBody,
  type TriggerConsolidateBody,
  type RetryWorkersBody,
  type ResumeConsolidateBody,
  type DemoSeedBody,
  type CancelRunBody,
  type DeleteRunBody,
} from "../validators/index.js";

const router = Router();

// ============================================================================
// Service Bus Helpers
// ============================================================================

let serviceBusClient: ServiceBusClient | null = null;
let workItemsSender: ServiceBusSender | null = null;
let consolidateSender: ServiceBusSender | null = null;

function getServiceBusClient(): ServiceBusClient | null {
  const connectionString = optionalEnv(
    "AZURE_SERVICE_BUS_CONNECTION_STRING",
    "",
  );
  if (!connectionString) {
    return null;
  }
  if (!serviceBusClient) {
    serviceBusClient = new ServiceBusClient(connectionString);
  }
  return serviceBusClient;
}

function getWorkItemsSender(): ServiceBusSender | null {
  const client = getServiceBusClient();
  if (!client) return null;
  if (!workItemsSender) {
    workItemsSender = client.createSender(SERVICE_BUS_QUEUES.WORK_ITEMS);
  }
  return workItemsSender;
}

function getConsolidateSender(): ServiceBusSender | null {
  const client = getServiceBusClient();
  if (!client) return null;
  if (!consolidateSender) {
    consolidateSender = client.createSender(SERVICE_BUS_QUEUES.CONSOLIDATE);
  }
  return consolidateSender;
}

async function sendWorkItem(message: WorkItemMessage): Promise<void> {
  const sender = getWorkItemsSender();
  if (!sender) {
    throw new Error("Service Bus not configured");
  }
  await sender.sendMessages({
    body: message,
    contentType: "application/json",
  });
}

async function sendConsolidateMessage(
  message: ConsolidateMessage,
): Promise<void> {
  const sender = getConsolidateSender();
  if (!sender) {
    throw new Error("Service Bus not configured");
  }
  await sender.sendMessages({
    body: message,
    contentType: "application/json",
  });
}

// ============================================================================
// Container Apps Job Helpers
// ============================================================================

interface SchedulerJobConfig {
  subscriptionId: string;
  resourceGroupName: string;
  jobNamePrefix: string;
}

/**
 * Maps a feed ID to the scheduler job key (suffix used in Azure job name).
 * Feed IDs like 'nivoda-natural' map directly to job keys.
 */
function feedToJobKey(feed: string): string {
  // diamond-staging-s-niv-labgrown
  return feed.replace('nivoda', 'niv');
}

function getSchedulerJobConfig(): SchedulerJobConfig | null {
  const subscriptionId = optionalEnv("AZURE_SUBSCRIPTION_ID", "");
  const resourceGroupName = optionalEnv("AZURE_RESOURCE_GROUP", "");
  // Support both new prefix-based and legacy single-job naming
  const jobNamePrefix = optionalEnv("AZURE_SCHEDULER_JOB_NAME_PREFIX", "")
    || optionalEnv("AZURE_SCHEDULER_JOB_NAME", "");

  if (!subscriptionId || !resourceGroupName || !jobNamePrefix) {
    return null;
  }

  return { subscriptionId, resourceGroupName, jobNamePrefix };
}

async function triggerSchedulerJob(
  runType: "full" | "incremental",
  feed?: string,
): Promise<{ executionName: string; jobName: string }> {
  const config = getSchedulerJobConfig();
  if (!config) {
    throw new Error("Azure Container Apps Job not configured");
  }

  // Derive the job name: prefix-{feedKey} for multi-job, or plain prefix for legacy
  // diamond-staging-s-
  // diamond-staging-s-niv-labgrown
  const jobName = feed
    ? `${config.jobNamePrefix}${feedToJobKey(feed)}`
    : config.jobNamePrefix;

  const credential = new DefaultAzureCredential();
  const client = new ContainerAppsAPIClient(credential, config.subscriptionId);

  // Fetch the existing job definition to preserve its environment variables.
  // When beginStart() is called with a template override, it replaces the
  // entire container spec - including env vars. Without this, env vars like
  // AZURE_STORAGE_CONNECTION_STRING are lost, causing the scheduler to fail.
  const job = await client.jobs.get(config.resourceGroupName, jobName);
  const existingContainers = job.template?.containers ?? [];

  // Merge RUN_TYPE and optionally FEED into the existing container's env vars
  const envOverrides = ["RUN_TYPE", ...(feed ? ["FEED"] : [])];
  const containers = existingContainers.map((container) => ({
    ...container,
    env: [
      ...(container.env ?? []).filter(
        (e) => !envOverrides.includes(e.name ?? ""),
      ),
      { name: "RUN_TYPE", value: runType },
      ...(feed ? [{ name: "FEED", value: feed }] : []),
    ],
  }));

  // Optionally override the image tag if CONTAINER_REGISTRY_SERVER is set
  const containerRegistryServer = optionalEnv("CONTAINER_REGISTRY_SERVER", "");
  const imageTag = optionalEnv("IMAGE_TAG", "");

  if (containerRegistryServer && imageTag) {
    const schedulerImage = `${containerRegistryServer}/diamond-scheduler:${imageTag}`;
    for (const container of containers) {
      if (container.name === "scheduler") {
        container.image = schedulerImage;
      }
    }
  }

  const poller = await client.jobs.beginStart(
    config.resourceGroupName,
    jobName,
    {
      template: { containers },
    },
  );

  // Get the initial result without waiting for completion
  // The job will run asynchronously
  const result = poller.getOperationState().result;

  return {
    executionName: result?.name || `${jobName}-${Date.now()}`,
    jobName,
  };
}

// ============================================================================
// Trigger Scheduler (Start a new run)
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/scheduler:
 *   post:
 *     summary: Trigger a new pipeline run (full or incremental)
 *     description: |
 *       Triggers the scheduler Azure Container Apps Job to start a new pipeline run.
 *       The job will perform a heatmap scan, partition work, and dispatch work items
 *       to the Service Bus queue for workers to process.
 *
 *       The run_type parameter controls whether to perform a full or incremental scan:
 *       - full: Scans all diamonds in Nivoda (resets watermark)
 *       - incremental: Scans only new diamonds since last watermark
 *
 *       If RUN_TYPE is not explicitly set, the scheduler auto-detects based on watermark state.
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               run_type:
 *                 type: string
 *                 enum: [full, incremental]
 *                 default: incremental
 *                 description: Type of run to perform
 *     responses:
 *       200:
 *         description: Scheduler job started successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Azure Container Apps Job not configured
 */
router.post(
  "/scheduler",
  validateBody(triggerSchedulerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as TriggerSchedulerBody;
      const feedArg = body.feed ? ` FEED=${body.feed}` : "";

      // Check if Azure Container Apps Job is configured
      const jobConfig = getSchedulerJobConfig();
      if (!jobConfig) {
        // Fall back to manual instructions if not in Azure
        res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message:
              "Azure Container Apps Job not configured. Scheduler must be run manually.",
          },
          manual_command: `${feedArg ? `FEED=${body.feed} ` : ""}npm run dev:scheduler -- --${body.run_type}`,
        });
        return;
      }

      // Trigger the Azure Container Apps Job
      try {
        const result = await triggerSchedulerJob(body.run_type, body.feed);

        res.json({
          data: {
            message: `Scheduler job triggered successfully for ${body.run_type} run${body.feed ? ` (feed: ${body.feed})` : ""}`,
            run_type: body.run_type,
            feed: body.feed,
            status: "started",
            execution_name: result.executionName,
            job_name: result.jobName,
          },
        });
      } catch (azureError) {
        // Handle Azure-specific errors with more helpful messages
        const errorMessage = azureError instanceof Error ? azureError.message : String(azureError);

        // Check for common Azure permission errors
        if (errorMessage.includes("AuthorizationFailed") ||
            errorMessage.includes("does not have authorization") ||
            errorMessage.includes("403")) {
          res.status(403).json({
            error: {
              code: "AZURE_PERMISSION_DENIED",
              message: "Azure permission denied. The API's managed identity needs 'Contributor' or 'Container Apps Jobs Contributor' role on the Container Apps Job.",
              details: errorMessage,
            },
            manual_command: `npm run dev:scheduler -- --${body.run_type}`,
            help: "For local development, run the scheduler manually using the command above.",
          });
          return;
        }

        if (errorMessage.includes("CredentialUnavailableError") ||
            errorMessage.includes("DefaultAzureCredential")) {
          res.status(503).json({
            error: {
              code: "AZURE_CREDENTIALS_UNAVAILABLE",
              message: "Azure credentials not available. Ensure the API is running with a managed identity or has Azure CLI credentials.",
              details: errorMessage,
            },
            manual_command: `npm run dev:scheduler -- --${body.run_type}`,
            help: "For local development, run the scheduler manually using the command above.",
          });
          return;
        }

        // Re-throw other errors to be handled by the global error handler
        throw azureError;
      }
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Trigger Consolidation
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/consolidate:
 *   post:
 *     summary: Manually trigger consolidation for a run
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - run_id
 *             properties:
 *               run_id:
 *                 type: string
 *                 format: uuid
 *               force:
 *                 type: boolean
 *                 default: false
 *                 description: Force consolidation even if workers failed
 *     responses:
 *       200:
 *         description: Consolidation triggered
 *       400:
 *         description: Invalid request or run has failed workers
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Service Bus not configured
 */
router.post(
  "/consolidate",
  validateBody(triggerConsolidateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as TriggerConsolidateBody;
      const traceId = generateTraceId();

      // Verify run exists
      const runMetadata = await getRunMetadata(body.run_id);
      if (!runMetadata) {
        throw notFound("Run not found");
      }

      // Check for failed workers
      if (runMetadata.failedWorkers > 0 && !body.force) {
        throw badRequest(
          `Run has ${runMetadata.failedWorkers} failed worker(s). Use force=true to consolidate anyway or retry the failed workers first.`,
        );
      }

      // Check Service Bus availability
      const client = getServiceBusClient();
      if (!client) {
        res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Service Bus not configured.",
          },
          manual_command: `npm run consolidator:trigger -- ${body.run_id}${body.force ? " --force" : ""}`,
        });
        return;
      }

      // Send consolidation message
      const message: ConsolidateMessage & { force?: boolean } = {
        type: "CONSOLIDATE",
        feed: runMetadata.feed,
        runId: body.run_id,
        traceId,
        force: body.force,
      };

      await sendConsolidateMessage(message as ConsolidateMessage);

      res.json({
        data: {
          message: "Consolidation triggered successfully",
          run_id: body.run_id,
          trace_id: traceId,
          force: body.force,
          run_metadata: {
            run_type: runMetadata.runType,
            expected_workers: runMetadata.expectedWorkers,
            completed_workers: runMetadata.completedWorkers,
            failed_workers: runMetadata.failedWorkers,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Retry Failed Workers
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/retry-workers:
 *   post:
 *     summary: Retry failed workers for a run
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - run_id
 *             properties:
 *               run_id:
 *                 type: string
 *                 format: uuid
 *               partition_id:
 *                 type: string
 *                 description: Optional specific partition to retry
 *     responses:
 *       200:
 *         description: Workers retried
 *       400:
 *         description: No failed workers or missing payload
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Service Bus not configured
 */
router.post(
  "/retry-workers",
  validateBody(retryWorkersSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as RetryWorkersBody;

      // Verify run exists
      const runMetadata = await getRunMetadata(body.run_id);
      if (!runMetadata) {
        throw notFound("Run not found");
      }

      // Get failed workers
      const failedWorkers = await getFailedWorkerRuns(body.run_id);
      if (failedWorkers.length === 0) {
        throw badRequest("No failed workers found for this run");
      }

      // Filter by partition if specified
      const workersToRetry = body.partition_id
        ? failedWorkers.filter((w) => w.partitionId === body.partition_id)
        : failedWorkers;

      if (workersToRetry.length === 0) {
        throw badRequest(
          `No failed workers found with partition_id: ${body.partition_id}`,
        );
      }

      // Check Service Bus availability
      const client = getServiceBusClient();
      if (!client) {
        res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Service Bus not configured.",
          },
          manual_command: body.partition_id
            ? `npm run worker:retry -- retry ${body.run_id} ${body.partition_id}`
            : `npm run worker:retry -- retry ${body.run_id}`,
        });
        return;
      }

      // Retry each failed worker
      const retriedWorkers: string[] = [];
      const skippedWorkers: { partitionId: string; reason: string }[] = [];

      for (const worker of workersToRetry) {
        if (!worker.workItemPayload) {
          skippedWorkers.push({
            partitionId: worker.partitionId,
            reason: "No stored payload for retry",
          });
          continue;
        }

        const workItem = worker.workItemPayload as unknown as WorkItemMessage;

        // Get the current partition progress to resume from correct offset.
        // The original payload has offset: 0, but partition_progress.next_offset
        // tracks how far the worker got before failing.
        const progress = await getPartitionProgress(body.run_id, worker.partitionId);
        workItem.offset = progress.nextOffset;

        // Reset the worker status in the database
        // (clears failed flag, preserves next_offset)
        await resetFailedWorker(body.run_id, worker.partitionId);

        // Re-queue the work item with the correct resume offset
        await sendWorkItem(workItem);

        retriedWorkers.push(worker.partitionId);
      }

      // If any workers were successfully re-queued, clear completed_at so the run
      // shows as "running" again instead of "completed". cancelRun() sets completed_at,
      // and without clearing it the status computation returns "completed" immediately
      // after retry even while workers are still processing.
      if (retriedWorkers.length > 0) {
        await reopenRun(body.run_id);
      }

      res.json({
        data: {
          message: `Retried ${retriedWorkers.length} worker(s)`,
          run_id: body.run_id,
          retried_partitions: retriedWorkers,
          skipped: skippedWorkers.length > 0 ? skippedWorkers : undefined,
          remaining_failed:
            failedWorkers.length -
            retriedWorkers.length -
            skippedWorkers.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// List Failed Workers (for UI dropdown)
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/failed-workers/{runId}:
 *   get:
 *     summary: List failed workers for a run
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of failed workers
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/failed-workers/:runId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { runId } = req.params;

      if (!runId) {
        throw badRequest("runId is required");
      }

      const runMetadata = await getRunMetadata(runId);
      if (!runMetadata) {
        throw notFound("Run not found");
      }

      const failedWorkers = await getFailedWorkerRuns(runId);

      res.json({
        data: {
          run_id: runId,
          total_failed: failedWorkers.length,
          workers: failedWorkers.map((w) => ({
            partition_id: w.partitionId,
            worker_id: w.workerId,
            error_message: w.errorMessage,
            records_processed: w.recordsProcessed,
            has_payload: !!w.workItemPayload,
            started_at: w.startedAt,
            completed_at: w.completedAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Resume Consolidation
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/resume-consolidation:
 *   post:
 *     summary: Resume consolidation for a run that partially completed
 *     description: |
 *       Resets failed/stuck diamonds back to pending and re-triggers consolidation.
 *       Use this when a consolidation run completed partially (e.g., 73%) and you
 *       want to retry the failed diamonds.
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - run_id
 *             properties:
 *               run_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Consolidation resume triggered
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Service Bus not configured
 */
router.post(
  "/resume-consolidation",
  validateBody(resumeConsolidateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as ResumeConsolidateBody;
      const traceId = generateTraceId();

      // Verify run exists
      const runMetadata = await getRunMetadata(body.run_id);
      if (!runMetadata) {
        throw notFound("Run not found");
      }

      // Reset failed/stuck diamonds so they can be reprocessed
      const resetCount = await resetFailedDiamonds(body.run_id);

      // Check Service Bus availability
      const client = getServiceBusClient();
      if (!client) {
        res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Service Bus not configured.",
          },
          manual_command: `npm run consolidator:trigger -- ${body.run_id} --force`,
          diamonds_reset: resetCount,
        });
        return;
      }

      // Send consolidation message with force=true (we're explicitly resuming)
      const message: ConsolidateMessage = {
        type: "CONSOLIDATE",
        feed: runMetadata.feed,
        runId: body.run_id,
        traceId,
        force: true,
      };

      await sendConsolidateMessage(message);

      res.json({
        data: {
          message: "Consolidation resume triggered successfully",
          run_id: body.run_id,
          trace_id: traceId,
          diamonds_reset: resetCount,
          run_metadata: {
            run_type: runMetadata.runType,
            expected_workers: runMetadata.expectedWorkers,
            completed_workers: runMetadata.completedWorkers,
            failed_workers: runMetadata.failedWorkers,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Seed Demo Feed Data
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/demo-seed:
 *   post:
 *     summary: Generate test data for the demo feed
 *     description: |
 *       Seeds the demo_feed_inventory table with deterministic test diamonds.
 *       Proxies to the demo-feed-api service.
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [full, incremental]
 *                 default: full
 *                 description: full truncates and re-inserts; incremental appends
 *               count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 500000
 *                 description: Number of diamonds to generate
 *     responses:
 *       200:
 *         description: Seed completed
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Demo feed API not configured
 */
router.post(
  "/demo-seed",
  validateBody(demoSeedSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as DemoSeedBody;
      const demoFeedApiUrl = optionalEnv("DEMO_FEED_API_URL", "");

      if (!demoFeedApiUrl) {
        res.status(503).json({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message:
              "Demo feed API URL not configured. Set DEMO_FEED_API_URL environment variable.",
          },
          manual_command: `npm run seed -w @diamond/demo-feed-seed -- ${body.mode}`,
        });
        return;
      }

      const seedUrl = `${demoFeedApiUrl}/api/seed`;
      const response = await fetch(seedUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: body.mode,
          ...(body.count ? { count: body.count } : {}),
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          (errorBody as { error?: string })?.error ??
            `Demo feed API returned ${response.status}`,
        );
      }

      const result = await response.json();
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Cancel Run
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/cancel-run:
 *   post:
 *     summary: Cancel a stalled or running run
 *     description: |
 *       Marks all incomplete partitions and running workers as failed,
 *       and sets the run as completed. Use this when a run has stalled
 *       (workers died, messages expired from Service Bus, etc.).
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - run_id
 *             properties:
 *               run_id:
 *                 type: string
 *                 format: uuid
 *               reason:
 *                 type: string
 *                 description: Optional reason for cancellation
 *     responses:
 *       200:
 *         description: Run cancelled successfully
 *       400:
 *         description: Run is already completed
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/cancel-run",
  validateBody(cancelRunSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as CancelRunBody;

      // Verify run exists
      const runMetadata = await getRunMetadata(body.run_id);
      if (!runMetadata) {
        throw notFound("Run not found");
      }

      // Check if run is already fully completed (all workers done, watermark advanced)
      if (runMetadata.completedAt && runMetadata.completedWorkers >= runMetadata.expectedWorkers) {
        throw badRequest("Run is already completed and cannot be cancelled");
      }

      const reason = body.reason ?? "Cancelled by user";
      const result = await cancelRun(body.run_id, reason);

      res.json({
        data: {
          message: "Run cancelled successfully",
          run_id: body.run_id,
          reason,
          cancelled_partitions: result.cancelledPartitions,
          cancelled_workers: result.cancelledWorkers,
          run_metadata: {
            run_type: runMetadata.runType,
            expected_workers: runMetadata.expectedWorkers,
            completed_workers: runMetadata.completedWorkers,
            failed_workers: runMetadata.failedWorkers,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// ============================================================================
// Delete Failed Run
// ============================================================================

/**
 * @openapi
 * /api/v2/triggers/delete-run:
 *   post:
 *     summary: Delete a failed run and all associated records
 *     description: |
 *       Permanently deletes a failed run along with its worker_runs and
 *       partition_progress records. Only runs with status 'failed' can be deleted.
 *       Raw diamonds are NOT deleted as they may have been upserted by subsequent runs.
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - run_id
 *             properties:
 *               run_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Run deleted successfully
 *       400:
 *         description: Run is not in failed status
 *       404:
 *         description: Run not found
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/delete-run",
  validateBody(deleteRunSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as DeleteRunBody;

      // Verify run exists
      const runMetadata = await getRunMetadata(body.run_id);
      if (!runMetadata) {
        throw notFound("Run not found");
      }

      // Compute status: only allow deletion of failed runs
      const totalFinished = runMetadata.completedWorkers + runMetadata.failedWorkers;
      const isFailed =
        runMetadata.failedWorkers > 0 &&
        totalFinished >= runMetadata.expectedWorkers;

      if (!isFailed) {
        throw badRequest(
          "Only failed runs can be deleted. This run's status is not 'failed'.",
        );
      }

      const result = await deleteFailedRun(body.run_id);

      res.json({
        data: {
          message: "Run deleted successfully",
          run_id: body.run_id,
          deleted_workers: result.deletedWorkers,
          deleted_partitions: result.deletedPartitions,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
