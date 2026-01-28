import {
  ServiceBusClient,
  ServiceBusReceiver,
  ServiceBusSender,
  ServiceBusReceivedMessage,
} from '@azure/service-bus';
import {
  requireEnv,
  SERVICE_BUS_QUEUES,
  type WorkItemMessage,
  type WorkDoneMessage,
  type ConsolidateMessage,
} from '@diamond/shared';

let serviceBusClient: ServiceBusClient | null = null;
let workItemsReceiver: ServiceBusReceiver | null = null;
let workItemsSender: ServiceBusSender | null = null;
let workDoneSender: ServiceBusSender | null = null;
let consolidateSender: ServiceBusSender | null = null;

function getServiceBusClient(): ServiceBusClient {
  if (!serviceBusClient) {
    serviceBusClient = new ServiceBusClient(
      requireEnv('AZURE_SERVICE_BUS_CONNECTION_STRING')
    );
  }
  return serviceBusClient;
}

export function getWorkItemsReceiver(): ServiceBusReceiver {
  if (!workItemsReceiver) {
    const client = getServiceBusClient();
    workItemsReceiver = client.createReceiver(SERVICE_BUS_QUEUES.WORK_ITEMS);
  }
  return workItemsReceiver;
}

function getWorkItemsSender(): ServiceBusSender {
  if (!workItemsSender) {
    const client = getServiceBusClient();
    workItemsSender = client.createSender(SERVICE_BUS_QUEUES.WORK_ITEMS);
  }
  return workItemsSender;
}

function getWorkDoneSender(): ServiceBusSender {
  if (!workDoneSender) {
    const client = getServiceBusClient();
    workDoneSender = client.createSender(SERVICE_BUS_QUEUES.WORK_DONE);
  }
  return workDoneSender;
}

function getConsolidateSender(): ServiceBusSender {
  if (!consolidateSender) {
    const client = getServiceBusClient();
    consolidateSender = client.createSender(SERVICE_BUS_QUEUES.CONSOLIDATE);
  }
  return consolidateSender;
}

export async function receiveWorkItem(): Promise<{
  message: WorkItemMessage;
  complete: () => Promise<void>;
  abandon: () => Promise<void>;
} | null> {
  const receiver = getWorkItemsReceiver();
  const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 5000 });

  if (messages.length === 0) {
    return null;
  }

  const receivedMessage = messages[0] as ServiceBusReceivedMessage;
  const workItem = receivedMessage.body as WorkItemMessage;

  return {
    message: workItem,
    complete: async () => {
      await receiver.completeMessage(receivedMessage);
    },
    abandon: async () => {
      await receiver.abandonMessage(receivedMessage);
    },
  };
}

export async function sendWorkDone(message: WorkDoneMessage): Promise<void> {
  const sender = getWorkDoneSender();
  await sender.sendMessages({
    body: message,
    contentType: 'application/json',
  });
}

export async function sendConsolidate(message: ConsolidateMessage): Promise<void> {
  const sender = getConsolidateSender();
  await sender.sendMessages({
    body: message,
    contentType: 'application/json',
  });
}

/**
 * Send a work item message for continuation pattern.
 * Sets messageId for deduplication and application properties for tracing.
 */
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

export async function closeConnections(): Promise<void> {
  if (workItemsReceiver) {
    await workItemsReceiver.close();
    workItemsReceiver = null;
  }
  if (workItemsSender) {
    await workItemsSender.close();
    workItemsSender = null;
  }
  if (workDoneSender) {
    await workDoneSender.close();
    workDoneSender = null;
  }
  if (consolidateSender) {
    await consolidateSender.close();
    consolidateSender = null;
  }
  if (serviceBusClient) {
    await serviceBusClient.close();
    serviceBusClient = null;
  }
}
