import { api } from './client';

// Types
export interface DashboardSummary {
  totalActiveDiamonds: number;
  totalFeeds: number;
  lastSuccessfulRun: RunMetadata | null;
  currentWatermark: string | null;
  recentRunsCount: {
    total: number;
    completed: number;
    failed: number;
    running: number;
  };
  diamondsByAvailability: {
    available: number;
    onHold: number;
    sold: number;
    unavailable: number;
  };
}

export interface RunMetadata {
  runId: string;
  runType: 'full' | 'incremental';
  expectedWorkers: number;
  completedWorkers: number;
  failedWorkers: number;
  watermarkBefore?: string;
  watermarkAfter?: string;
  startedAt: string;
  completedAt?: string;
}

export interface RunWithStats extends RunMetadata {
  feed: string;
  totalRecordsProcessed: number;
  estimatedRecords: number;
  durationMs: number | null;
  status: 'running' | 'completed' | 'failed' | 'partial' | 'stalled';
}

export interface WorkerRun {
  id: string;
  runId: string;
  partitionId: string;
  workerId: string;
  status: 'running' | 'completed' | 'failed';
  recordsProcessed: number;
  errorMessage?: string;
  workItemPayload?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
}

export interface FeedStats {
  feed: string;
  totalDiamonds: number;
  availableDiamonds: number;
  onHoldDiamonds: number;
  soldDiamonds: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  lastUpdated: string | null;
}

export interface ConsolidationProgress {
  runId: string;
  totalRawDiamonds: number;
  consolidatedCount: number;
  pendingCount: number;
  failedCount: number;
  progressPercent: number;
  oldestPendingCreatedAt: string | null;
}

export interface RunConsolidationStatus {
  runId: string;
  runType: 'full' | 'incremental';
  startedAt: string;
  completedAt: string | null;
  expectedWorkers: number;
  completedWorkers: number;
  failedWorkers: number;
  consolidationStartedAt: string | null;
  consolidationCompletedAt: string | null;
  consolidationProcessed: number;
  consolidationErrors: number;
  consolidationTotal: number;
  liveProgress: ConsolidationProgress | null;
}

export interface ConsolidationStats {
  totalRaw: number;
  totalConsolidated: number;
  totalPending: number;
  progressPercent: number;
}

export type AnalyticsFeed = 'nivoda-natural' | 'nivoda-labgrown' | 'demo';

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RunsFilter {
  run_type?: 'full' | 'incremental';
  status?: 'running' | 'completed' | 'failed' | 'partial' | 'stalled';
  feed?: string;
  started_after?: string;
  started_before?: string;
  page?: number;
  limit?: number;
}

// Combined dashboard response type
export interface DashboardData {
  summary: DashboardSummary;
  runs: RunWithStats[];
  failedWorkers: RecentFailedWorker[];
  watermarks: Record<string, Watermark | null>;
}

// API Functions
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const response = await api.get<{ data: DashboardSummary }>('/analytics/summary');
  return response.data.data;
}

export async function getDashboardData(): Promise<DashboardData> {
  const response = await api.get<{ data: DashboardData }>('/analytics/dashboard');
  return response.data.data;
}

export async function getRuns(filters: RunsFilter = {}): Promise<PaginatedResponse<RunWithStats>> {
  const params = new URLSearchParams();
  if (filters.run_type) params.set('run_type', filters.run_type);
  if (filters.status) params.set('status', filters.status);
  if (filters.feed) params.set('feed', filters.feed);
  if (filters.started_after) params.set('started_after', filters.started_after);
  if (filters.started_before) params.set('started_before', filters.started_before);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const response = await api.get<PaginatedResponse<RunWithStats>>(`/analytics/runs?${params}`);
  return response.data;
}

export async function getRunDetails(runId: string): Promise<{ run: RunWithStats; workers: WorkerRun[] }> {
  const response = await api.get<{ data: { run: RunWithStats; workers: WorkerRun[] } }>(
    `/analytics/runs/${runId}`
  );
  return response.data.data;
}

export async function getFeedStats(): Promise<FeedStats[]> {
  const response = await api.get<{ data: FeedStats[] }>('/analytics/feeds');
  return response.data.data;
}

export async function getConsolidationStats(feed: AnalyticsFeed = 'nivoda-natural'): Promise<ConsolidationStats> {
  const response = await api.get<{ data: ConsolidationStats }>(`/analytics/consolidation?feed=${feed}`);
  return response.data.data;
}

export async function getConsolidationProgress(runId: string, feed: AnalyticsFeed = 'nivoda-natural'): Promise<ConsolidationProgress> {
  const response = await api.get<{ data: ConsolidationProgress }>(`/analytics/consolidation/${runId}?feed=${feed}`);
  return response.data.data;
}

export async function getConsolidationStatus(limit = 10, feed: AnalyticsFeed = 'nivoda-natural'): Promise<RunConsolidationStatus[]> {
  const response = await api.get<{ data: RunConsolidationStatus[] }>(`/analytics/consolidation/status?feed=${feed}&limit=${limit}`);
  return response.data.data;
}

export interface RecentFailedWorker {
  id: string;
  runId: string;
  partitionId: string;
  workerId: string;
  status: 'failed';
  recordsProcessed: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  runType: 'full' | 'incremental';
  runStartedAt: string;
}

export async function getRecentFailedWorkers(limit = 20): Promise<RecentFailedWorker[]> {
  const response = await api.get<{ data: RecentFailedWorker[] }>(`/analytics/failed-workers?limit=${limit}`);
  return response.data.data;
}

// Error Logs
export interface ErrorLog {
  id: string;
  service: string;
  errorMessage: string;
  stackTrace?: string;
  context?: Record<string, unknown>;
  createdAt: string;
}

export interface ErrorLogsFilter {
  service?: string;
  runId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export async function getErrorLogs(filters: ErrorLogsFilter = {}): Promise<PaginatedResponse<ErrorLog>> {
  const params = new URLSearchParams();
  if (filters.service) params.set('service', filters.service);
  if (filters.runId) params.set('runId', filters.runId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  const response = await api.get<PaginatedResponse<ErrorLog>>(`/analytics/error-logs?${params}`);
  return response.data;
}

export async function getErrorLogServices(): Promise<string[]> {
  const response = await api.get<{ data: string[] }>('/analytics/error-logs/services');
  return response.data.data;
}

export async function clearErrorLogs(service?: string): Promise<number> {
  const params = service ? { service } : {};
  const response = await api.delete<{ deleted: number }>('/analytics/error-logs', { params });
  return response.data.deleted;
}

// Watermark
export interface Watermark {
  lastUpdatedAt: string;
  lastRunId?: string;
  lastRunCompletedAt?: string;
}

export async function getWatermark(feed?: string): Promise<Watermark | null> {
  const params = feed ? `?feed=${feed}` : '';
  const response = await api.get<{ data: Watermark | null }>(`/analytics/watermark${params}`);
  return response.data.data;
}

export async function updateWatermark(watermark: Watermark, feed?: string): Promise<Watermark> {
  const params = feed ? `?feed=${feed}` : '';
  const response = await api.put<{ data: Watermark }>(`/analytics/watermark${params}`, watermark);
  return response.data.data;
}

// Holds
export interface HoldHistoryItem {
  id: string;
  diamondId: string;
  feed: string;
  feedHoldId?: string;
  offerId: string;
  status: 'active' | 'expired' | 'released';
  denied: boolean;
  holdUntil?: string;
  createdAt: string;
}

export async function getHolds(page = 1, limit = 50): Promise<PaginatedResponse<HoldHistoryItem>> {
  const response = await api.get<PaginatedResponse<HoldHistoryItem>>(
    `/analytics/holds?page=${page}&limit=${limit}`
  );
  return response.data;
}

// Orders
export interface PurchaseHistoryItem {
  id: string;
  orderNumber?: string;
  diamondId: string;
  feed: string;
  feedOrderId?: string;
  offerId: string;
  idempotencyKey: string;
  status: string;
  paymentStatus: string;
  feedOrderStatus: string;
  amountCents?: number;
  currency?: string;
  feedOrderError?: string;
  reference?: string;
  comments?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getOrders(page = 1, limit = 50): Promise<PaginatedResponse<PurchaseHistoryItem>> {
  const response = await api.get<PaginatedResponse<PurchaseHistoryItem>>(
    `/analytics/orders?page=${page}&limit=${limit}`
  );
  return response.data;
}
