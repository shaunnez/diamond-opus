import {
  ServiceBusClient,
  ServiceBusReceiver,
  ServiceBusReceivedMessage,
} from '@azure/service-bus';
import {
  requireEnv,
  SERVICE_BUS_QUEUES,
  type ConsolidateMessage,
} from '@diamond/shared';

let serviceBusClient: ServiceBusClient | null = null;
let consolidateReceiver: ServiceBusReceiver | null = null;

function getServiceBusClient(): ServiceBusClient {
  if (!serviceBusClient) {
    serviceBusClient = new ServiceBusClient(
      requireEnv('AZURE_SERVICE_BUS_CONNECTION_STRING')
    );
  }
  return serviceBusClient;
}

export function getConsolidateReceiver(): ServiceBusReceiver {
  if (!consolidateReceiver) {
    const client = getServiceBusClient();
    consolidateReceiver = client.createReceiver(SERVICE_BUS_QUEUES.CONSOLIDATE);
  }
  return consolidateReceiver;
}

export async function receiveConsolidateMessage(): Promise<{
  message: ConsolidateMessage;
  complete: () => Promise<void>;
  abandon: () => Promise<void>;
} | null> {
  const receiver = getConsolidateReceiver();
  const messages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 5000 });

  if (messages.length === 0) {
    return null;
  }

  const receivedMessage = messages[0] as ServiceBusReceivedMessage;
  const consolidateMessage = receivedMessage.body as ConsolidateMessage;

  return {
    message: consolidateMessage,
    complete: async () => {
      await receiver.completeMessage(receivedMessage);
    },
    abandon: async () => {
      await receiver.abandonMessage(receivedMessage);
    },
  };
}

export async function closeConnections(): Promise<void> {
  if (consolidateReceiver) {
    await consolidateReceiver.close();
    consolidateReceiver = null;
  }
  if (serviceBusClient) {
    await serviceBusClient.close();
    serviceBusClient = null;
  }
}
