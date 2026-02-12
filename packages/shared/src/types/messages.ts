export interface WorkItemMessage {
  type: 'WORK_ITEM';
  /** Feed identifier (e.g., 'nivoda', 'demo') */
  feed: string;
  runId: string;
  /** Trace ID for distributed tracing correlation */
  traceId: string;
  partitionId: string;
  /** Minimum price filter (inclusive). For Nivoda: dollars per carat. */
  minPrice: number;
  /** Maximum price filter (inclusive). For Nivoda: dollars per carat. */
  maxPrice: number;
  /** Estimated total records in this price range (from heatmap - may differ from actual) */
  estimatedRecords: number;
  /** Current page offset for continuation pattern (page to fetch) */
  offset: number;
  /** Page size for this work item (typically 30) */
  limit: number;
  updatedFrom?: string;
  updatedTo?: string;
}

export interface WorkDoneMessage {
  type: 'WORK_DONE';
  /** Feed identifier (e.g., 'nivoda', 'demo') */
  feed: string;
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
  /** Feed identifier (e.g., 'nivoda', 'demo') */
  feed: string;
  runId: string;
  /** Trace ID for distributed tracing correlation */
  traceId: string;
  /** Force consolidation even if workers failed */
  force?: boolean;
}

export type ServiceBusMessage = WorkItemMessage | WorkDoneMessage | ConsolidateMessage;
