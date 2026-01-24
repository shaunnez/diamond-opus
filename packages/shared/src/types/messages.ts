export interface WorkItemMessage {
  type: 'WORK_ITEM';
  runId: string;
  partitionId: string;
  offsetStart: number;
  offsetEnd: number;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface WorkDoneMessage {
  type: 'WORK_DONE';
  runId: string;
  workerId: string;
  partitionId: string;
  recordsProcessed: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface ConsolidateMessage {
  type: 'CONSOLIDATE';
  runId: string;
}

export type ServiceBusMessage = WorkItemMessage | WorkDoneMessage | ConsolidateMessage;
