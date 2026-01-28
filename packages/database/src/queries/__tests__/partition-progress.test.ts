/**
 * Test harness for partition progress idempotency guard.
 * Demonstrates how the continuation pattern handles duplicates and out-of-order messages.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock in-memory database for testing
interface MockPartitionProgressRow {
  run_id: string;
  partition_id: string;
  next_offset: number;
  completed: boolean;
  created_at: Date;
  updated_at: Date;
}

let mockDatabase: Map<string, MockPartitionProgressRow> = new Map();

// Create the mock query function
const mockQueryFn = vi.fn(async (sql: string, params: unknown[]) => {
  // INSERT INTO partition_progress ... ON CONFLICT DO NOTHING RETURNING *
  if (sql.includes('INSERT INTO partition_progress')) {
    const [runId, partitionId] = params as [string, string];
    const key = `${runId}:${partitionId}`;

    if (mockDatabase.has(key)) {
      // Conflict - return empty rows
      return { rows: [] };
    }

    const row: MockPartitionProgressRow = {
      run_id: runId,
      partition_id: partitionId,
      next_offset: 0,
      completed: false,
      created_at: new Date(),
      updated_at: new Date(),
    };

    mockDatabase.set(key, row);
    return { rows: [row] };
  }

  // SELECT * FROM partition_progress WHERE run_id = $1 AND partition_id = $2
  if (sql.includes('SELECT * FROM partition_progress') && !sql.includes('SELECT completed')) {
    const [runId, partitionId] = params as [string, string];
    const key = `${runId}:${partitionId}`;
    const row = mockDatabase.get(key);

    if (!row) {
      throw new Error(`Partition progress not found for runId=${runId}, partitionId=${partitionId}`);
    }

    return { rows: [row] };
  }

  // UPDATE partition_progress SET completed = TRUE ...
  if (sql.includes('SET completed = TRUE')) {
    const [runId, partitionId, expectedOffset] = params as [string, string, number];
    const key = `${runId}:${partitionId}`;
    const row = mockDatabase.get(key);

    if (!row || row.next_offset !== expectedOffset || row.completed) {
      // Condition not met - return empty rows (update failed)
      return { rows: [] };
    }

    // Update the row
    row.completed = true;
    row.updated_at = new Date();
    mockDatabase.set(key, row);

    return { rows: [{ updated: true }] };
  }

  // UPDATE partition_progress SET next_offset = ...
  if (sql.includes('SET next_offset')) {
    const [runId, partitionId, newOffset, currentOffset] = params as [string, string, number, number];
    const key = `${runId}:${partitionId}`;
    const row = mockDatabase.get(key);

    if (!row || row.next_offset !== currentOffset || row.completed) {
      // Condition not met - return empty rows (update failed)
      return { rows: [] };
    }

    // Update the row
    row.next_offset = newOffset;
    row.updated_at = new Date();
    mockDatabase.set(key, row);

    return { rows: [{ updated: true }] };
  }

  // SELECT completed FROM partition_progress WHERE ...
  if (sql.includes('SELECT completed')) {
    const [runId, partitionId] = params as [string, string];
    const key = `${runId}:${partitionId}`;
    const row = mockDatabase.get(key);

    if (!row) {
      return { rows: [] };
    }

    return { rows: [{ completed: row.completed }] };
  }

  throw new Error(`Unhandled SQL: ${sql}`);
});

// Mock the pg module to prevent real database connections
vi.mock('pg', () => ({
  default: {
    Pool: class MockPool {
      query = mockQueryFn;

      async connect() {
        return {
          query: mockQueryFn,
          release: vi.fn(),
        };
      }
    },
  },
}));

import {
  initializePartitionProgress,
  getPartitionProgress,
  updatePartitionOffset,
  completePartition,
  isPartitionCompleted,
} from '../partition-progress.js';

describe('Partition Progress Idempotency', () => {
  const runId = 'test-run-id';
  const partitionId = 'test-partition-1';

  beforeEach(async () => {
    // Clear mock database between tests
    mockDatabase.clear();
  });

  it('should initialize partition progress with offset 0', async () => {
    const progress = await initializePartitionProgress(runId, partitionId);

    expect(progress.runId).toBe(runId);
    expect(progress.partitionId).toBe(partitionId);
    expect(progress.nextOffset).toBe(0);
    expect(progress.completed).toBe(false);
  });

  it('should return existing progress on duplicate initialization', async () => {
    // First initialization
    const progress1 = await initializePartitionProgress(runId, partitionId);

    // Second initialization (duplicate)
    const progress2 = await initializePartitionProgress(runId, partitionId);

    // Should return the same progress
    expect(progress2.runId).toBe(progress1.runId);
    expect(progress2.nextOffset).toBe(progress1.nextOffset);
  });

  it('should update offset atomically when current offset matches', async () => {
    await initializePartitionProgress(runId, partitionId);

    // Process first page (offset 0 -> 30)
    const updated = await updatePartitionOffset(runId, partitionId, 0, 30);
    expect(updated).toBe(true);

    const progress = await getPartitionProgress(runId, partitionId);
    expect(progress.nextOffset).toBe(30);
  });

  it('should reject offset update when current offset does not match (duplicate message)', async () => {
    await initializePartitionProgress(runId, partitionId);

    // Process first page (offset 0 -> 30)
    await updatePartitionOffset(runId, partitionId, 0, 30);

    // Try to process first page again (duplicate message)
    const updated = await updatePartitionOffset(runId, partitionId, 0, 30);
    expect(updated).toBe(false); // Should reject

    const progress = await getPartitionProgress(runId, partitionId);
    expect(progress.nextOffset).toBe(30); // Should remain unchanged
  });

  it('should reject offset update when processing out-of-order message', async () => {
    await initializePartitionProgress(runId, partitionId);

    // Process first page (offset 0 -> 30)
    await updatePartitionOffset(runId, partitionId, 0, 30);

    // Try to process third page before second page (offset 60 -> 90)
    const updated = await updatePartitionOffset(runId, partitionId, 60, 90);
    expect(updated).toBe(false); // Should reject out-of-order

    const progress = await getPartitionProgress(runId, partitionId);
    expect(progress.nextOffset).toBe(30); // Should remain unchanged
  });

  it('should complete partition when at expected offset', async () => {
    await initializePartitionProgress(runId, partitionId);

    // Process pages sequentially
    await updatePartitionOffset(runId, partitionId, 0, 30);
    await updatePartitionOffset(runId, partitionId, 30, 60);

    // Complete partition at offset 60 (last page was partial)
    const marked = await completePartition(runId, partitionId, 60);
    expect(marked).toBe(true);

    const isCompleted = await isPartitionCompleted(runId, partitionId);
    expect(isCompleted).toBe(true);
  });

  it('should reject completion when offset does not match', async () => {
    await initializePartitionProgress(runId, partitionId);

    // Process first page
    await updatePartitionOffset(runId, partitionId, 0, 30);

    // Try to complete at wrong offset
    const marked = await completePartition(runId, partitionId, 60);
    expect(marked).toBe(false); // Should reject

    const isCompleted = await isPartitionCompleted(runId, partitionId);
    expect(isCompleted).toBe(false); // Should still be incomplete
  });

  it('should skip processing when partition is already completed', async () => {
    await initializePartitionProgress(runId, partitionId);

    // Complete partition
    await completePartition(runId, partitionId, 0);

    const progress = await getPartitionProgress(runId, partitionId);
    expect(progress.completed).toBe(true);

    // Try to update offset after completion
    const updated = await updatePartitionOffset(runId, partitionId, 0, 30);
    expect(updated).toBe(false); // Should reject updates after completion
  });
});

describe('Partition Progress Continuation Scenario', () => {
  const runId = 'continuation-run';
  const partitionId = 'partition-A';

  beforeEach(async () => {
    // Clear mock database between tests
    mockDatabase.clear();
  });

  it('should handle full continuation flow', async () => {
    // Initialize partition
    await initializePartitionProgress(runId, partitionId);

    // Simulate processing 5 pages of 30 records each
    const pageSize = 30;
    const totalPages = 5;

    for (let page = 0; page < totalPages - 1; page++) {
      const currentOffset = page * pageSize;
      const newOffset = (page + 1) * pageSize;

      const updated = await updatePartitionOffset(
        runId,
        partitionId,
        currentOffset,
        newOffset
      );
      expect(updated).toBe(true);

      const progress = await getPartitionProgress(runId, partitionId);
      expect(progress.nextOffset).toBe(newOffset);
      expect(progress.completed).toBe(false);
    }

    // Last page (partial: only 20 records)
    const lastPageOffset = (totalPages - 1) * pageSize; // 120
    const finalOffset = lastPageOffset + 20; // 140

    // Update offset for last partial page
    const lastPageUpdated = await updatePartitionOffset(
      runId,
      partitionId,
      lastPageOffset,
      finalOffset
    );
    expect(lastPageUpdated).toBe(true);

    // Mark as completed
    const marked = await completePartition(runId, partitionId, finalOffset);
    expect(marked).toBe(true);

    const isCompleted = await isPartitionCompleted(runId, partitionId);
    expect(isCompleted).toBe(true);
  });

  it('should handle retry scenario with idempotency', async () => {
    await initializePartitionProgress(runId, partitionId + '-retry');

    // Process first page
    await updatePartitionOffset(runId, partitionId + '-retry', 0, 30);

    // Simulate retry of first page (duplicate)
    const retryUpdate = await updatePartitionOffset(
      runId,
      partitionId + '-retry',
      0,
      30
    );
    expect(retryUpdate).toBe(false); // Should be rejected

    // Process second page normally
    const secondUpdate = await updatePartitionOffset(
      runId,
      partitionId + '-retry',
      30,
      60
    );
    expect(secondUpdate).toBe(true);

    const progress = await getPartitionProgress(runId, partitionId + '-retry');
    expect(progress.nextOffset).toBe(60);
  });
});
