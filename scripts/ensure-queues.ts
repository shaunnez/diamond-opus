/**
 * Service Bus Queue Bootstrap Helper
 *
 * Ensures required queues exist in the Service Bus namespace.
 * Used for local development with the Service Bus Emulator.
 *
 * The emulator creates queues from Config.json on startup, but this
 * script provides a programmatic safety net that can be called by
 * tests or other tooling.
 *
 * Usage:
 *   npx tsx scripts/ensure-queues.ts
 *
 * Does NOT modify production behaviour — only runs when explicitly invoked.
 */

import { ServiceBusAdministrationClient } from '@azure/service-bus';

const REQUIRED_QUEUES = ['work-items', 'work-done', 'consolidate'];

async function ensureQueues(): Promise<void> {
  const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  if (!connectionString) {
    console.error('AZURE_SERVICE_BUS_CONNECTION_STRING is not set');
    process.exit(1);
  }

  const adminClient = new ServiceBusAdministrationClient(connectionString);

  for (const queueName of REQUIRED_QUEUES) {
    try {
      const exists = await adminClient.queueExists(queueName);
      if (exists) {
        console.log(`Queue "${queueName}" exists`);
      } else {
        await adminClient.createQueue(queueName);
        console.log(`Queue "${queueName}" created`);
      }
    } catch (error) {
      // Emulator may not support admin API — log and continue
      console.warn(
        `Could not verify queue "${queueName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  console.log('Queue bootstrap complete');
}

ensureQueues().catch((err) => {
  console.error('Queue bootstrap failed:', err);
  process.exit(1);
});
