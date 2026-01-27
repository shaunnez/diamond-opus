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

  await client.emails.send({
    from,
    to,
    subject: `[Diamond Platform] ${subject}`,
    text: body,
  });

  console.log(`Alert email sent: ${subject}`);
}
