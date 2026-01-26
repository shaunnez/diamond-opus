export interface WorkItemMessage {
  type: 'WORK_ITEM';
  runId: string;
  /** Trace ID for distributed tracing correlation */
  traceId: string;
  partitionId: string;
  /** Minimum price filter in dollars (inclusive) */
  minPrice: number;
  /** Maximum price filter in dollars (inclusive) */
  maxPrice: number;
  /** Expected total records in this price range */
  totalRecords: number;
  /** Offset start within the filtered result set (typically 0) */
  offsetStart: number;
  /** Offset end within the filtered result set (typically equals totalRecords) */
  offsetEnd: number;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface WorkDoneMessage {
  type: 'WORK_DONE';
  runId: string;
  /** Trace ID for distributed tracing correlation */
  traceId: string;
  workerId: string;
  partitionId: string;
  recordsProcessed: number;
  status: 'success' | 'failed';
  error?: string;
}

export interface ConsolidateMessage {
  type: 'CONSOLIDATE';
  runId: string;
  /** Trace ID for distributed tracing correlation */
  traceId: string;
  /** Force consolidation even if workers failed */
  force?: boolean;
}

export type ServiceBusMessage = WorkItemMessage | WorkDoneMessage | ConsolidateMessage;
