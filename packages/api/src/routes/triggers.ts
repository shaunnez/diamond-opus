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
} from "@diamond/database";
import { validateBody, badRequest, notFound } from "../middleware/index.js";
import {
  triggerSchedulerSchema,
  triggerConsolidateSchema,
  retryWorkersSchema,
  type TriggerSchedulerBody,
  type TriggerConsolidateBody,
  type RetryWorkersBody,
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
  jobName: string;
}

function getSchedulerJobConfig(): SchedulerJobConfig | null {
  const subscriptionId = optionalEnv("AZURE_SUBSCRIPTION_ID", "");
  const resourceGroupName = optionalEnv("AZURE_RESOURCE_GROUP", "");
  const jobName = optionalEnv("AZURE_SCHEDULER_JOB_NAME", "");

  if (!subscriptionId || !resourceGroupName || !jobName) {
    return null;
  }

  return { subscriptionId, resourceGroupName, jobName };
}

async function triggerSchedulerJob(
  runType: "full" | "incremental",
): Promise<{ executionName: string }> {
  const config = getSchedulerJobConfig();
  if (!config) {
    throw new Error("Azure Container Apps Job not configured");
  }

  const credential = new DefaultAzureCredential();
  const client = new ContainerAppsAPIClient(credential, config.subscriptionId);

  // Start the Container Apps Job with environment override for run type
  // beginStart is an LRO (Long Running Operation) that returns a poller
  const poller = await client.jobs.beginStart(
    config.resourceGroupName,
    config.jobName,
    {
      template: {
        containers: [
          {
            name: "scheduler",
            env: [
              {
                name: "RUN_TYPE",
                value: runType,
              },
            ],
          },
        ],
      },
    },
  );

  // Wait for the job execution to start (not complete)
  const result = await poller.pollUntilDone();

  return {
    executionName: result.name || `${config.jobName}-${Date.now()}`,
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
 *     tags:
 *       - Triggers
 *     security:
 *       - ApiKeyAuth: []
 *       - HmacAuth: []
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
          manual_command: `npm run dev:scheduler -- --${body.run_type}`,
        });
        return;
      }

      // Trigger the Azure Container Apps Job
      const result = await triggerSchedulerJob(body.run_type);

      res.json({
        data: {
          message: `Scheduler job triggered successfully for ${body.run_type} run`,
          run_type: body.run_type,
          status: "started",
          execution_name: result.executionName,
          job_name: jobConfig.jobName,
        },
      });
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
 *       - HmacAuth: []
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
 *       - HmacAuth: []
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

        // Reset the worker status in the database
        await resetFailedWorker(body.run_id, worker.partitionId);

        // Re-queue the work item
        await sendWorkItem(workItem);

        retriedWorkers.push(worker.partitionId);
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
 *       - HmacAuth: []
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

export default router;
