import { Resend } from 'resend';
import { optionalEnv } from '@diamond/shared';

let resend: Resend | null = null;

function getResend(): Resend | null {
  const apiKey = optionalEnv('RESEND_API_KEY', '');
  if (!apiKey) {
    return null;
  }

  if (!resend) {
    resend = new Resend(apiKey);
  }
  return resend;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rate limiting: minimum spacing between sends to stay under Resend's 2/sec limit
const MIN_SEND_INTERVAL_MS = 600;
let lastSendTime = 0;

// Serialize sends within this process to prevent concurrent rate limit hits
let sendQueue: Promise<void> = Promise.resolve();

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;

// Resend error names that are safe to retry
const RETRYABLE_ERROR_NAMES = new Set([
  'rate_limit_exceeded',
  'application_error',
  'internal_server_error',
]);

async function sendWithRateLimitAndRetry(
  client: Resend,
  from: string,
  to: string,
  subject: string,
  text: string
): Promise<void> {
  // Enforce minimum spacing between sends
  const now = Date.now();
  const elapsed = now - lastSendTime;
  if (elapsed < MIN_SEND_INTERVAL_MS) {
    await sleep(MIN_SEND_INTERVAL_MS - elapsed);
  }

  let lastError = 'Unknown error';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    lastSendTime = Date.now();

    try {
      const { error } = await client.emails.send({ from, to, subject, text });

      if (!error) {
        return;
      }

      lastError = error.message;

      if (!RETRYABLE_ERROR_NAMES.has(error.name)) {
        throw new Error(`Failed to send email: ${error.name} - ${error.message}`);
      }
    } catch (thrown: unknown) {
      // Re-throw non-retryable errors from above
      if (thrown instanceof Error && thrown.message.startsWith('Failed to send email:')) {
        throw thrown;
      }
      // Network/connection errors are retryable
      lastError = thrown instanceof Error ? thrown.message : String(thrown);
    }

    if (attempt < MAX_RETRIES) {
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `Email send error (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms: ${lastError}`
      );
      await sleep(delay);
    }
  }

  throw new Error(`Failed to send email after ${MAX_RETRIES} retries: ${lastError}`);
}

function formatDuration(startedAt: Date, completedAt: Date): string {
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

export interface ReapplyJobEmailData {
  jobId: string;
  status: 'completed' | 'failed';
  totalDiamonds: number;
  processedDiamonds: number;
  updatedDiamonds: number;
  failedDiamonds: number;
  startedAt: Date;
  completedAt: Date;
  error?: string;
}

/**
 * Send email notification for repricing job completion or failure.
 * @param data - Job completion/failure data
 */
export async function sendReapplyJobEmail(data: ReapplyJobEmailData): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn('Resend not configured, skipping repricing job email');
    console.log(`Repricing job ${data.status}: ${data.jobId}`);
    return;
  }

  const from = optionalEnv('ALERT_EMAIL_FROM', 'onboarding@resend.dev');
  const to = optionalEnv('ALERT_EMAIL_TO', '');

  if (!to) {
    console.warn('ALERT_EMAIL_TO not configured, skipping repricing job email');
    return;
  }

  const environment = optionalEnv('ENVIRONMENT', 'unknown');
  const duration = formatDuration(data.startedAt, data.completedAt);

  const subject =
    data.status === 'completed'
      ? `[Diamond Platform] Repricing Job Completed`
      : `[Diamond Platform] Repricing Job Failed`;

  let text = `Pricing reapply job ${data.status}\n\n`;
  text += `Environment: ${environment}\n`;
  text += `Job ID: ${data.jobId}\n`;
  text += `Status: ${data.status}\n`;
  text += `\n`;
  text += `Total diamonds: ${data.totalDiamonds.toLocaleString()}\n`;
  text += `Processed: ${data.processedDiamonds.toLocaleString()}\n`;
  text += `Updated (changed pricing): ${data.updatedDiamonds.toLocaleString()}\n`;
  text += `Failed: ${data.failedDiamonds.toLocaleString()}\n`;
  text += `\n`;
  text += `Duration: ${duration}\n`;
  text += `Started: ${data.startedAt.toISOString()}\n`;
  text += `Completed: ${data.completedAt.toISOString()}\n`;

  if (data.error) {
    text += `\nError: ${data.error}\n`;
  }

  text += `\nDashboard: ${optionalEnv('DASHBOARD_URL', 'https://dashboard.example.com')}/pricing-rules\n`;

  // Serialize through queue to prevent concurrent sends from hitting rate limit.
  // Previous failures are caught so they don't block subsequent sends.
  sendQueue = sendQueue
    .catch(() => {})
    .then(() => sendWithRateLimitAndRetry(client, from, to, subject, text));

  await sendQueue;
  console.log(`Repricing job email sent: ${data.status} - ${data.jobId}`);
}
