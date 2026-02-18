import { optionalEnv } from './env.js';

export enum NotifyChannel {
  ERRORS = 'errors',
  PIPELINE = 'pipeline',
  OPS = 'ops',
}

export enum NotifyCategory {
  // Pipeline lifecycle
  SCHEDULER_STARTED = 'scheduler_started',
  SCHEDULER_FAILED = 'scheduler_failed',
  RUN_COMPLETED = 'run_completed',
  RUN_PARTIAL_SUCCESS = 'run_partial_success',
  RUN_FAILED = 'run_failed',

  // Consolidation
  CONSOLIDATION_COMPLETED = 'consolidation_completed',
  CONSOLIDATION_SKIPPED = 'consolidation_skipped',
  CONSOLIDATION_FAILED = 'consolidation_failed',

  // Worker
  WORKER_ERROR = 'worker_error',

  // API
  API_ERROR = 'api_error',
  AUTH_FAILURE = 'auth_failure',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',

  // Repricing
  REPRICING_COMPLETED = 'repricing_completed',
  REPRICING_FAILED = 'repricing_failed',

  // Infrastructure
  DATABASE_ERROR = 'database_error',
  EXTERNAL_SERVICE_ERROR = 'external_service_error',
}

const CATEGORY_CHANNEL_MAP: Record<NotifyCategory, NotifyChannel> = {
  [NotifyCategory.SCHEDULER_STARTED]: NotifyChannel.OPS,
  [NotifyCategory.SCHEDULER_FAILED]: NotifyChannel.ERRORS,
  [NotifyCategory.RUN_COMPLETED]: NotifyChannel.PIPELINE,
  [NotifyCategory.RUN_PARTIAL_SUCCESS]: NotifyChannel.PIPELINE,
  [NotifyCategory.RUN_FAILED]: NotifyChannel.ERRORS,
  [NotifyCategory.CONSOLIDATION_COMPLETED]: NotifyChannel.PIPELINE,
  [NotifyCategory.CONSOLIDATION_SKIPPED]: NotifyChannel.PIPELINE,
  [NotifyCategory.CONSOLIDATION_FAILED]: NotifyChannel.ERRORS,
  [NotifyCategory.WORKER_ERROR]: NotifyChannel.ERRORS,
  [NotifyCategory.API_ERROR]: NotifyChannel.ERRORS,
  [NotifyCategory.AUTH_FAILURE]: NotifyChannel.ERRORS,
  [NotifyCategory.RATE_LIMIT_EXCEEDED]: NotifyChannel.OPS,
  [NotifyCategory.REPRICING_COMPLETED]: NotifyChannel.OPS,
  [NotifyCategory.REPRICING_FAILED]: NotifyChannel.OPS,
  [NotifyCategory.DATABASE_ERROR]: NotifyChannel.ERRORS,
  [NotifyCategory.EXTERNAL_SERVICE_ERROR]: NotifyChannel.ERRORS,
};

// Slack attachment color coding
const CATEGORY_COLOR_MAP: Record<NotifyCategory, string> = {
  [NotifyCategory.SCHEDULER_STARTED]: '#17a2b8',
  [NotifyCategory.SCHEDULER_FAILED]: '#dc3545',
  [NotifyCategory.RUN_COMPLETED]: '#28a745',
  [NotifyCategory.RUN_PARTIAL_SUCCESS]: '#ffc107',
  [NotifyCategory.RUN_FAILED]: '#dc3545',
  [NotifyCategory.CONSOLIDATION_COMPLETED]: '#28a745',
  [NotifyCategory.CONSOLIDATION_SKIPPED]: '#ffc107',
  [NotifyCategory.CONSOLIDATION_FAILED]: '#dc3545',
  [NotifyCategory.WORKER_ERROR]: '#dc3545',
  [NotifyCategory.API_ERROR]: '#dc3545',
  [NotifyCategory.AUTH_FAILURE]: '#dc3545',
  [NotifyCategory.RATE_LIMIT_EXCEEDED]: '#ffc107',
  [NotifyCategory.REPRICING_COMPLETED]: '#28a745',
  [NotifyCategory.REPRICING_FAILED]: '#dc3545',
  [NotifyCategory.DATABASE_ERROR]: '#dc3545',
  [NotifyCategory.EXTERNAL_SERVICE_ERROR]: '#dc3545',
};

const WEBHOOK_ENV_MAP: Record<NotifyChannel, string> = {
  [NotifyChannel.ERRORS]: 'SLACK_WEBHOOK_ERRORS',
  [NotifyChannel.PIPELINE]: 'SLACK_WEBHOOK_PIPELINE',
  [NotifyChannel.OPS]: 'SLACK_WEBHOOK_OPS',
};

export interface NotifyOptions {
  category: NotifyCategory;
  title: string;
  message: string;
  /** Structured context fields shown in the Slack message (runId, traceId, feed, etc.) */
  context?: Record<string, string>;
  /** Optional error object — stack trace first 4 frames included in the message */
  error?: Error | unknown;
}

// Warn once per missing webhook URL rather than on every notification
const missingWebhookWarned = new Set<NotifyChannel>();

// Per-channel send queues to serialize sends and respect Slack's ~1 msg/sec limit
const MIN_SEND_INTERVAL_MS = 500;
const lastSendTime: Partial<Record<NotifyChannel, number>> = {};
const sendQueues: Partial<Record<NotifyChannel, Promise<void>>> = {};

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;
}

function formatErrorForSlack(error: Error | unknown): string {
  if (!error) return '';
  if (error instanceof Error) {
    const stackLines = (error.stack ?? '').split('\n').slice(0, 5).join('\n');
    return `*Error:* \`${error.name}: ${error.message}\`\n\`\`\`${stackLines}\`\`\``;
  }
  return `*Error:* \`${String(error)}\``;
}

async function sendToWebhook(webhookUrl: string, options: NotifyOptions): Promise<void> {
  const environment = optionalEnv('ENVIRONMENT', 'unknown');
  const color = CATEGORY_COLOR_MAP[options.category];

  // Build message body, appending error info if present
  let messageText = truncate(options.message, 2800);
  if (options.error) {
    const errorBlock = formatErrorForSlack(options.error);
    messageText = truncate(`${messageText}\n\n${errorBlock}`, 3000);
  }

  // Build context field line from options.context
  const contextParts: string[] = [];
  if (options.context) {
    for (const [k, v] of Object.entries(options.context)) {
      contextParts.push(`*${k}:* ${v}`);
    }
  }

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: truncate(options.title, 150), emoji: false },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: messageText || '_(no details)_' },
    },
  ];

  if (contextParts.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: contextParts.join(' | ') },
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: `*category:* ${options.category}` },
      { type: 'mrkdwn', text: `*env:* ${environment}` },
      { type: 'mrkdwn', text: `*time:* ${new Date().toISOString()}` },
    ],
  });

  const payload = {
    attachments: [{ color, blocks }],
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) return;

    // 4xx errors are not retryable (bad webhook config, etc.)
    if (response.status >= 400 && response.status < 500) {
      throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
    }

    if (attempt < MAX_RETRIES) {
      await sleep(BASE_RETRY_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw new Error(`Slack webhook failed after ${MAX_RETRIES} retries`);
}

/**
 * Send a structured notification to the appropriate Slack channel based on category.
 *
 * - Routing is determined by the category (errors → #errors, pipeline status → #pipeline, ops → #ops)
 * - Channels are configured via SLACK_WEBHOOK_ERRORS, SLACK_WEBHOOK_PIPELINE, SLACK_WEBHOOK_OPS env vars
 * - If a webhook URL is not configured, a warning is logged once and the notification is skipped
 * - Sends are serialized per channel with minimum 500ms spacing to respect Slack rate limits
 * - All errors are caught internally — this function never throws or rejects
 *
 * @example
 * ```typescript
 * await notify({
 *   category: NotifyCategory.RUN_COMPLETED,
 *   title: 'Run Completed',
 *   message: 'Feed: nivoda, Workers: 10/10 succeeded',
 *   context: { runId: 'abc', feed: 'nivoda' },
 * });
 * ```
 */
export function notify(options: NotifyOptions): Promise<void> {
  const channel = CATEGORY_CHANNEL_MAP[options.category];
  const envVar = WEBHOOK_ENV_MAP[channel];
  const webhookUrl = optionalEnv(envVar, '');

  if (!webhookUrl) {
    if (!missingWebhookWarned.has(channel)) {
      missingWebhookWarned.add(channel);
      console.warn(`[slack] ${envVar} not configured — ${channel} channel notifications will be skipped`);
    }
    return Promise.resolve();
  }

  // Serialize sends per channel with rate limiting
  const prev = sendQueues[channel] ?? Promise.resolve();
  const next: Promise<void> = prev.catch(() => {}).then(async () => {
    // Enforce minimum spacing between sends on this channel
    const now = Date.now();
    const elapsed = now - (lastSendTime[channel] ?? 0);
    if (elapsed < MIN_SEND_INTERVAL_MS) {
      await sleep(MIN_SEND_INTERVAL_MS - elapsed);
    }
    lastSendTime[channel] = Date.now();

    try {
      await sendToWebhook(webhookUrl, options);
    } catch (err) {
      // Never let Slack send errors surface to callers
      console.error('[slack] Failed to send notification', {
        category: options.category,
        title: options.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  sendQueues[channel] = next;
  return next;
}

/**
 * Format a duration in milliseconds to a human-readable string (e.g. "2h 15m 30s").
 * Exported here as it's used by both pricing-rules and slack notification formatting.
 */
export function formatDuration(startedAt: Date, completedAt: Date): string {
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/** Reset internal state (for testing only) */
export function _resetSlackState(): void {
  missingWebhookWarned.clear();
  for (const k of Object.keys(lastSendTime) as NotifyChannel[]) {
    delete lastSendTime[k];
  }
  for (const k of Object.keys(sendQueues) as NotifyChannel[]) {
    delete sendQueues[k];
  }
}
