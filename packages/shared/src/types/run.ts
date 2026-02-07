export type RunType = 'full' | 'incremental';

export type WorkerStatus = 'running' | 'completed' | 'failed';

export interface RunMetadata {
  runId: string;
  feed: string;
  runType: RunType;
  expectedWorkers: number;
  completedWorkers: number;
  failedWorkers: number;
  watermarkBefore?: Date;
  watermarkAfter?: Date;
  startedAt: Date;
  completedAt?: Date;
}

export interface WorkerRun {
  id: string;
  runId: string;
  partitionId: string;
  workerId: string;
  status: WorkerStatus;
  recordsProcessed: number;
  errorMessage?: string;
  workItemPayload?: Record<string, unknown>;
  startedAt: Date;
  completedAt?: Date;
}

export interface Watermark {
  lastUpdatedAt: string;
  lastRunId?: string;
  lastRunCompletedAt?: string;
}
