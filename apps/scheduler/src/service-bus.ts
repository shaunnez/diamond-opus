import { ServiceBusClient, ServiceBusSender } from '@azure/service-bus';
import {
  requireEnv,
  SERVICE_BUS_QUEUES,
  type WorkItemMessage,
} from '@diamond/shared';

let serviceBusClient: ServiceBusClient | null = null;
let workItemsSender: ServiceBusSender | null = null;

function getServiceBusClient(): ServiceBusClient {
  if (!serviceBusClient) {
    serviceBusClient = new ServiceBusClient(
      requireEnv('AZURE_SERVICE_BUS_CONNECTION_STRING')
    );
  }
  return serviceBusClient;
}

function getWorkItemsSender(): ServiceBusSender {
  if (!workItemsSender) {
    const client = getServiceBusClient();
    workItemsSender = client.createSender(SERVICE_BUS_QUEUES.WORK_ITEMS);
  }
  return workItemsSender;
}

export async function sendWorkItem(message: WorkItemMessage): Promise<void> {
  const sender = getWorkItemsSender();

  // Create stable messageId for deduplication: runId:partitionId:offset
  const messageId = `${message.runId}:${message.partitionId}:${message.offset}`;

  await sender.sendMessages({
    body: message,
    contentType: 'application/json',
    messageId,
    applicationProperties: {
      runId: message.runId,
      partitionId: message.partitionId,
      offset: message.offset,
      limit: message.limit,
    },
  });
}

export async function sendWorkItems(messages: WorkItemMessage[]): Promise<void> {
  const sender = getWorkItemsSender();
  const batch = await sender.createMessageBatch();

  for (const message of messages) {
    // Create stable messageId for deduplication: runId:partitionId:offset
    const messageId = `${message.runId}:${message.partitionId}:${message.offset}`;

    const added = batch.tryAddMessage({
      body: message,
      contentType: 'application/json',
      messageId,
      applicationProperties: {
        runId: message.runId,
        partitionId: message.partitionId,
        offset: message.offset,
        limit: message.limit,
      },
    });

    if (!added) {
      await sender.sendMessages(batch);
      const newBatch = await sender.createMessageBatch();
      newBatch.tryAddMessage({
        body: message,
        contentType: 'application/json',
        messageId,
        applicationProperties: {
          runId: message.runId,
          partitionId: message.partitionId,
          offset: message.offset,
          limit: message.limit,
        },
      });
    }
  }

  if (batch.count > 0) {
    await sender.sendMessages(batch);
  }
}

export async function closeConnections(): Promise<void> {
  if (workItemsSender) {
    await workItemsSender.close();
    workItemsSender = null;
  }
  if (serviceBusClient) {
    await serviceBusClient.close();
    serviceBusClient = null;
  }
}
