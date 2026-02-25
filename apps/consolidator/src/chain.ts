import { ContainerAppsAPIClient } from '@azure/arm-appcontainers';
import { DefaultAzureCredential } from '@azure/identity';
import { createServiceLogger, optionalEnv } from '@diamond/shared';

const log = createServiceLogger('consolidator').child({ component: 'chain' });

interface SchedulerJobConfig {
  subscriptionId: string;
  resourceGroupName: string;
  jobNamePrefix: string;
}

function feedToJobKey(feed: string): string {
  return feed.replace('nivoda', 'niv');
}

function getSchedulerJobConfig(): SchedulerJobConfig | null {
  const subscriptionId = optionalEnv('AZURE_SUBSCRIPTION_ID', '');
  const resourceGroupName = optionalEnv('AZURE_RESOURCE_GROUP', '');
  const jobNamePrefix =
    optionalEnv('AZURE_SCHEDULER_JOB_NAME_PREFIX', '') ||
    optionalEnv('AZURE_SCHEDULER_JOB_NAME', '');

  if (!subscriptionId || !resourceGroupName || !jobNamePrefix) {
    return null;
  }

  return { subscriptionId, resourceGroupName, jobNamePrefix };
}

async function triggerSchedulerJob(
  feed: string,
  runType: 'full' | 'incremental',
  config: SchedulerJobConfig,
): Promise<void> {
  const jobName = `${config.jobNamePrefix}${feedToJobKey(feed)}`;

  // For user-assigned managed identity, DefaultAzureCredential needs the client ID
  // to know which identity to use. AZURE_CLIENT_ID is set to the user-assigned
  // identity's client_id by Terraform. Falls back gracefully when not set (local dev).
  const managedIdentityClientId = optionalEnv('AZURE_CLIENT_ID', '') || undefined;
  const credential = new DefaultAzureCredential({ managedIdentityClientId });
  const client = new ContainerAppsAPIClient(credential, config.subscriptionId);

  // Fetch the existing job definition to preserve its environment variables.
  // beginStart() with a template override replaces the entire container spec
  // (including env vars), so we must merge our overrides with the existing env.
  const job = await client.jobs.get(config.resourceGroupName, jobName);
  const existingContainers = job.template?.containers ?? [];

  const containers = existingContainers.map((container) => ({
    ...container,
    env: [
      ...(container.env ?? []).filter(
        (e) => e.name !== 'RUN_TYPE' && e.name !== 'FEED',
      ),
      { name: 'RUN_TYPE', value: runType },
      { name: 'FEED', value: feed },
    ],
  }));

  const poller = await client.jobs.beginStart(
    config.resourceGroupName,
    jobName,
    { template: { containers } },
  );

  const result = poller.getOperationState().result;
  const executionName = result?.name ?? `${jobName}-${Date.now()}`;

  log.info('Triggered next feed scheduler job', { feed, runType, jobName, executionName });
}

/**
 * After a feed's consolidation completes, trigger the next feed in the chain.
 *
 * Chain is configured via the FEED_CHAIN env var (JSON object mapping feed IDs):
 *   FEED_CHAIN={"nivoda-natural":"nivoda-labgrown"}
 *
 * If FEED_CHAIN is not set, the completed feed has no chain entry, or Azure is
 * not configured, this is a silent no-op. Errors are logged as warnings and
 * never propagated — a chain failure must never fail the consolidation itself.
 */
export async function triggerNextFeed(
  completedFeedId: string,
  runType: 'full' | 'incremental',
): Promise<void> {
  const chainEnv = optionalEnv('FEED_CHAIN', '');
  if (!chainEnv) {
    log.debug('FEED_CHAIN not configured, skipping chain trigger');
    return;
  }

  let chain: Record<string, string>;
  try {
    chain = JSON.parse(chainEnv) as Record<string, string>;
  } catch {
    log.warn('FEED_CHAIN is not valid JSON, skipping chain trigger', { FEED_CHAIN: chainEnv });
    return;
  }

  const nextFeedId = chain[completedFeedId];
  if (!nextFeedId) {
    log.debug('No chain entry for this feed, done', { completedFeedId });
    return;
  }

  const config = getSchedulerJobConfig();
  if (!config) {
    log.warn(
      'Azure scheduler job not configured (missing AZURE_SUBSCRIPTION_ID / AZURE_RESOURCE_GROUP / AZURE_SCHEDULER_JOB_NAME_PREFIX) — chain trigger skipped',
      { completedFeedId, nextFeedId },
    );
    return;
  }

  await triggerSchedulerJob(nextFeedId, runType, config);
}
