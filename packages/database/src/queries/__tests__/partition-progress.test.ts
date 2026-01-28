/**
 * Test harness for partition progress idempotency guard.
 * Demonstrates how the continuation pattern handles duplicates and out-of-order messages.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
    // Note: In a real test, you would clean up the database or use transactions
    // For this test harness, we're demonstrating the behavior
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
    const lastPageOffset = (totalPages - 1) * pageSize;
    const finalOffset = lastPageOffset + 20;

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
