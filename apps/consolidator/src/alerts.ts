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

export async function sendAlert(subject: string, body: string): Promise<void> {
  const client = getResend();
  if (!client) {
    console.warn('Resend not configured, skipping alert email');
    console.warn(`Alert: ${subject}`);
    // Truncate body to 2KB to avoid exceeding Azure log size limits
    const truncatedBody = body.length > 2048 ? body.slice(0, 2048) + '...[truncated]' : body;
    console.warn(truncatedBody);
    return;
  }

  const from = optionalEnv('ALERT_EMAIL_FROM', 'noreply@diamond-platform.com');
  const to = optionalEnv('ALERT_EMAIL_TO', '');

  if (!to) {
    console.warn('ALERT_EMAIL_TO not configured, skipping alert email');
    return;
  }

  const fullSubject = `[Diamond Platform] ${subject}`;

  // Serialize through queue to prevent concurrent sends from hitting rate limit.
  // Previous failures are caught so they don't block subsequent sends.
  sendQueue = sendQueue
    .catch(() => {})
    .then(() => sendWithRateLimitAndRetry(client, from, to, fullSubject, body));

  await sendQueue;
  console.log(`Alert email sent: ${subject}`);
}
