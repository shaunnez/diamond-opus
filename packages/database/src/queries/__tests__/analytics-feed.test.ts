/**
 * Tests for feed-aware analytics queries.
 * Verifies that consolidation analytics correctly resolve the raw table
 * based on the feed parameter and reject invalid feeds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database client before importing analytics
const mockQueryFn = vi.fn();
vi.mock('../../client.js', () => ({
  query: (...args: unknown[]) => mockQueryFn(...args),
}));

import {
  resolveRawTable,
  isValidAnalyticsFeed,
  getConsolidationProgress,
  getOverallConsolidationStats,
  getRunsConsolidationStatus,
  type AnalyticsFeed,
} from '../analytics.js';

describe('resolveRawTable', () => {
  it('returns raw_diamonds_nivoda for nivoda-natural feed', () => {
    expect(resolveRawTable('nivoda-natural')).toBe('raw_diamonds_nivoda');
  });

  it('returns raw_diamonds_nivoda for nivoda-labgrown feed', () => {
    expect(resolveRawTable('nivoda-labgrown')).toBe('raw_diamonds_nivoda');
  });

  it('returns raw_diamonds_demo for demo feed', () => {
    expect(resolveRawTable('demo')).toBe('raw_diamonds_demo');
  });

  it('throws for invalid feed', () => {
    expect(() => resolveRawTable('invalid' as AnalyticsFeed)).toThrow('Invalid analytics feed');
  });
});

describe('isValidAnalyticsFeed', () => {
  it('returns true for nivoda-natural', () => {
    expect(isValidAnalyticsFeed('nivoda-natural')).toBe(true);
  });

  it('returns true for nivoda-labgrown', () => {
    expect(isValidAnalyticsFeed('nivoda-labgrown')).toBe(true);
  });

  it('returns true for demo', () => {
    expect(isValidAnalyticsFeed('demo')).toBe(true);
  });

  it('returns false for unknown feed', () => {
    expect(isValidAnalyticsFeed('unknown')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidAnalyticsFeed('')).toBe(false);
  });
});

describe('getConsolidationProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries raw_diamonds_nivoda by default', async () => {
    mockQueryFn.mockResolvedValue({
      rows: [{
        total_raw: '100',
        consolidated_count: '80',
        pending_count: '15',
        failed_count: '5',
        oldest_pending: null,
      }],
    });

    const result = await getConsolidationProgress('run-123');

    expect(mockQueryFn).toHaveBeenCalledTimes(1);
    const sql = mockQueryFn.mock.calls[0][0] as string;
    expect(sql).toContain('raw_diamonds_nivoda');
    expect(sql).not.toContain('raw_diamonds_demo');
    expect(result).toEqual({
      runId: 'run-123',
      totalRawDiamonds: 100,
      consolidatedCount: 80,
      pendingCount: 15,
      failedCount: 5,
      progressPercent: 80,
      oldestPendingCreatedAt: null,
    });
  });

  it('queries raw_diamonds_demo when feed is demo', async () => {
    mockQueryFn.mockResolvedValue({
      rows: [{
        total_raw: '50',
        consolidated_count: '50',
        pending_count: '0',
        failed_count: '0',
        oldest_pending: null,
      }],
    });

    const result = await getConsolidationProgress('run-456', 'demo');

    const sql = mockQueryFn.mock.calls[0][0] as string;
    expect(sql).toContain('raw_diamonds_demo');
    expect(sql).not.toContain('raw_diamonds_nivoda');
    expect(result?.progressPercent).toBe(100);
  });

  it('returns null when no rows', async () => {
    mockQueryFn.mockResolvedValue({ rows: [] });

    const result = await getConsolidationProgress('run-999');
    expect(result).toBeNull();
  });
});

describe('getOverallConsolidationStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries raw_diamonds_nivoda by default', async () => {
    mockQueryFn.mockResolvedValue({
      rows: [{
        total_raw: '1000',
        consolidated_count: '900',
        pending_count: '100',
      }],
    });

    const result = await getOverallConsolidationStats();

    const sql = mockQueryFn.mock.calls[0][0] as string;
    expect(sql).toContain('raw_diamonds_nivoda');
    expect(result).toEqual({
      totalRaw: 1000,
      totalConsolidated: 900,
      totalPending: 100,
      progressPercent: 90,
    });
  });

  it('queries raw_diamonds_demo when feed is demo', async () => {
    mockQueryFn.mockResolvedValue({
      rows: [{
        total_raw: '200',
        consolidated_count: '200',
        pending_count: '0',
      }],
    });

    const result = await getOverallConsolidationStats('demo');

    const sql = mockQueryFn.mock.calls[0][0] as string;
    expect(sql).toContain('raw_diamonds_demo');
    expect(result.progressPercent).toBe(100);
  });

  it('handles zero records without division error', async () => {
    mockQueryFn.mockResolvedValue({
      rows: [{
        total_raw: '0',
        consolidated_count: '0',
        pending_count: '0',
      }],
    });

    const result = await getOverallConsolidationStats();
    expect(result.progressPercent).toBe(0);
  });
});

describe('getRunsConsolidationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries raw_diamonds_nivoda by default and filters by feed', async () => {
    mockQueryFn.mockResolvedValue({ rows: [] });

    await getRunsConsolidationStatus(10);

    const sql = mockQueryFn.mock.calls[0][0] as string;
    expect(sql).toContain('raw_diamonds_nivoda');
    // Should filter run_metadata by feed
    expect(sql).toContain('rm.feed = $1');
    // Params: [feed, limit]
    const params = mockQueryFn.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('nivoda-natural');
    expect(params[1]).toBe(10);
  });

  it('queries raw_diamonds_demo and filters by demo feed', async () => {
    mockQueryFn.mockResolvedValue({ rows: [] });

    await getRunsConsolidationStatus(5, 'demo');

    const sql = mockQueryFn.mock.calls[0][0] as string;
    expect(sql).toContain('raw_diamonds_demo');
    expect(sql).toContain('rm.feed = $1');
    const params = mockQueryFn.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('demo');
    expect(params[1]).toBe(5);
  });

  it('returns mapped run status with live progress', async () => {
    mockQueryFn.mockResolvedValue({
      rows: [{
        run_id: 'run-1',
        run_type: 'full',
        started_at: new Date('2024-01-01'),
        completed_at: new Date('2024-01-01T01:00:00'),
        expected_workers: 10,
        completed_workers_actual: '10',
        failed_workers_actual: '0',
        consolidation_started_at: new Date('2024-01-01T01:00:01'),
        consolidation_completed_at: new Date('2024-01-01T01:05:00'),
        consolidation_processed: 500,
        consolidation_errors: 0,
        consolidation_total: 500,
        total_raw: '500',
        consolidated_count: '500',
        pending_count: '0',
        failed_count: '0',
        oldest_pending: null,
      }],
    });

    const result = await getRunsConsolidationStatus(10, 'nivoda-natural');

    expect(result).toHaveLength(1);
    expect(result[0].runId).toBe('run-1');
    expect(result[0].liveProgress).toEqual({
      runId: 'run-1',
      totalRawDiamonds: 500,
      consolidatedCount: 500,
      pendingCount: 0,
      failedCount: 0,
      progressPercent: 100,
      oldestPendingCreatedAt: null,
    });
  });
});
