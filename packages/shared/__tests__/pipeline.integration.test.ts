/**
 * Integration tests for the diamond pipeline message flow.
 * These tests verify the message contracts and flow between
 * scheduler → worker → consolidator without requiring real services.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockWorkItemMessage,
  createMockWorkDoneMessage,
  createMockConsolidateMessage,
  createMockServiceBus,
  createMockNotifyClient,
} from '../src/testing/index.js';
import { generateTraceId } from '../src/utils/logger.js';
import {
  AUTO_CONSOLIDATION_SUCCESS_THRESHOLD,
  AUTO_CONSOLIDATION_DELAY_MINUTES,
} from '../src/constants.js';
import type {
  WorkItemMessage,
  WorkDoneMessage,
  ConsolidateMessage,
} from '../src/types/messages.js';

describe('Pipeline Message Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TraceId Propagation', () => {
    it('should propagate traceId from scheduler through all messages', () => {
      const traceId = generateTraceId();
      const runId = 'run-123';

      // Scheduler creates work items with traceId
      const workItem = createMockWorkItemMessage({
        runId,
        traceId,
        partitionId: 'partition-1',
      });

      expect(workItem.traceId).toBe(traceId);
      expect(workItem.runId).toBe(runId);

      // Worker creates work done message preserving traceId
      const workDone = createMockWorkDoneMessage({
        runId,
        traceId,
        partitionId: workItem.partitionId,
      });

      expect(workDone.traceId).toBe(traceId);
      expect(workDone.runId).toBe(runId);

      // Worker creates consolidate message preserving traceId
      const consolidate = createMockConsolidateMessage({
        runId,
        traceId,
      });

      expect(consolidate.traceId).toBe(traceId);
      expect(consolidate.runId).toBe(runId);
    });

    it('should generate unique trace IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(1000);
    });
  });

  describe('WorkItemMessage Contract', () => {
    it('should have all required fields', () => {
      const message = createMockWorkItemMessage();

      expect(message.type).toBe('WORK_ITEM');
      expect(message.runId).toBeDefined();
      expect(message.traceId).toBeDefined();
      expect(message.partitionId).toBeDefined();
      expect(typeof message.minPrice).toBe('number');
      expect(typeof message.maxPrice).toBe('number');
      expect(typeof message.estimatedRecords).toBe('number');
    });

    it('should allow optional updatedFrom/updatedTo for incremental runs', () => {
      const fullRun = createMockWorkItemMessage();
      expect(fullRun.updatedFrom).toBeUndefined();

      const incrementalRun = createMockWorkItemMessage({
        updatedFrom: '2024-01-01T00:00:00.000Z',
        updatedTo: '2024-01-02T00:00:00.000Z',
      });

      expect(incrementalRun.updatedFrom).toBe('2024-01-01T00:00:00.000Z');
      expect(incrementalRun.updatedTo).toBe('2024-01-02T00:00:00.000Z');
    });

    it('should enforce price range constraints', () => {
      const message = createMockWorkItemMessage({
        minPrice: 1000,
        maxPrice: 5000,
      });

      expect(message.minPrice).toBe(1000);
      expect(message.maxPrice).toBe(5000);
      expect(message.maxPrice).toBeGreaterThan(message.minPrice);
    });
  });

  describe('WorkDoneMessage Contract', () => {
    it('should have all required fields', () => {
      const message = createMockWorkDoneMessage();

      expect(message.type).toBe('WORK_DONE');
      expect(message.runId).toBeDefined();
      expect(message.traceId).toBeDefined();
      expect(message.workerId).toBeDefined();
      expect(message.partitionId).toBeDefined();
      expect(typeof message.recordsProcessed).toBe('number');
      expect(['success', 'failed']).toContain(message.status);
    });

    it('should include error message on failure', () => {
      const failedMessage = createMockWorkDoneMessage({
        status: 'failed',
        error: 'Connection timeout',
      });

      expect(failedMessage.status).toBe('failed');
      expect(failedMessage.error).toBe('Connection timeout');
    });

    it('should not include error message on success', () => {
      const successMessage = createMockWorkDoneMessage({
        status: 'success',
      });

      expect(successMessage.status).toBe('success');
      expect(successMessage.error).toBeUndefined();
    });
  });

  describe('ConsolidateMessage Contract', () => {
    it('should have all required fields', () => {
      const message = createMockConsolidateMessage();

      expect(message.type).toBe('CONSOLIDATE');
      expect(message.runId).toBeDefined();
      expect(message.traceId).toBeDefined();
    });
  });

  describe('Mock Service Bus', () => {
    it('should allow sending and receiving work items', async () => {
      const bus = createMockServiceBus();
      const workItem = createMockWorkItemMessage();

      await bus.sendWorkItem(workItem);

      expect(bus.workItems).toHaveLength(1);
      expect(bus.workItems[0].body).toEqual(workItem);

      const received = await bus.receiveWorkItem<WorkItemMessage>();
      expect(received).toEqual(workItem);
      expect(bus.workItems).toHaveLength(0);
    });

    it('should allow sending and receiving work done messages', async () => {
      const bus = createMockServiceBus();
      const workDone = createMockWorkDoneMessage();

      await bus.sendWorkDone(workDone);

      expect(bus.workDone).toHaveLength(1);

      const received = await bus.receiveWorkDone<WorkDoneMessage>();
      expect(received).toEqual(workDone);
    });

    it('should allow sending and receiving consolidate messages', async () => {
      const bus = createMockServiceBus();
      const consolidate = createMockConsolidateMessage();

      await bus.sendConsolidate(consolidate);

      expect(bus.consolidate).toHaveLength(1);

      const received = await bus.receiveConsolidate<ConsolidateMessage>();
      expect(received).toEqual(consolidate);
    });

    it('should return null when queue is empty', async () => {
      const bus = createMockServiceBus();

      const workItem = await bus.receiveWorkItem();
      const workDone = await bus.receiveWorkDone();
      const consolidate = await bus.receiveConsolidate();

      expect(workItem).toBeNull();
      expect(workDone).toBeNull();
      expect(consolidate).toBeNull();
    });

    it('should maintain message order (FIFO)', async () => {
      const bus = createMockServiceBus();

      const messages = [
        createMockWorkItemMessage({ partitionId: 'p1' }),
        createMockWorkItemMessage({ partitionId: 'p2' }),
        createMockWorkItemMessage({ partitionId: 'p3' }),
      ];

      for (const msg of messages) {
        await bus.sendWorkItem(msg);
      }

      for (const expected of messages) {
        const received = await bus.receiveWorkItem<WorkItemMessage>();
        expect(received?.partitionId).toBe(expected.partitionId);
      }
    });

    it('should track message timestamps', async () => {
      const bus = createMockServiceBus();
      const before = new Date();

      await bus.sendWorkItem(createMockWorkItemMessage());

      const after = new Date();
      const sentAt = bus.workItems[0].sentAt;

      expect(sentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sentAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should reset all queues', async () => {
      const bus = createMockServiceBus();

      await bus.sendWorkItem(createMockWorkItemMessage());
      await bus.sendWorkDone(createMockWorkDoneMessage());
      await bus.sendConsolidate(createMockConsolidateMessage());

      bus.reset();

      expect(bus.workItems).toHaveLength(0);
      expect(bus.workDone).toHaveLength(0);
      expect(bus.consolidate).toHaveLength(0);
    });
  });

  describe('Worker Completion Logic Simulation', () => {
    it('should trigger consolidation when all workers succeed', async () => {
      const bus = createMockServiceBus();
      const traceId = generateTraceId();
      const runId = 'run-456';
      const expectedWorkers = 3;

      // Simulate run metadata tracking
      let completedWorkers = 0;
      let failedWorkers = 0;

      // Simulate 3 workers completing successfully
      for (let i = 0; i < expectedWorkers; i++) {
        // Create work done message (simulating what worker would send)
        createMockWorkDoneMessage({
          runId,
          traceId,
          partitionId: `partition-${i}`,
          status: 'success',
          recordsProcessed: 100,
        });

        completedWorkers++;

        // Last worker triggers consolidation
        if (completedWorkers === expectedWorkers && failedWorkers === 0) {
          await bus.sendConsolidate({
            type: 'CONSOLIDATE',
            runId,
            traceId,
          });
        }
      }

      expect(bus.consolidate).toHaveLength(1);
      expect(bus.consolidate[0].body).toEqual({
        type: 'CONSOLIDATE',
        runId,
        traceId,
      });
    });

    it('should auto-start consolidation with force when >=70% workers succeed', async () => {
      const bus = createMockServiceBus();
      const notifyClient = createMockNotifyClient();
      const traceId = generateTraceId();
      const runId = 'run-789';
      const expectedWorkers = 10;

      // 8 succeed, 2 fail = 80% success
      const completedWorkers = 8;
      const failedWorkers = 2;
      const successRate = completedWorkers / expectedWorkers;

      // Simulate the auto-consolidation logic from the worker
      if (completedWorkers + failedWorkers >= expectedWorkers) {
        if (completedWorkers === expectedWorkers && failedWorkers === 0) {
          await bus.sendConsolidate({ type: 'CONSOLIDATE', runId, traceId });
        } else if (successRate >= AUTO_CONSOLIDATION_SUCCESS_THRESHOLD && completedWorkers > 0) {
          await bus.sendConsolidate({ type: 'CONSOLIDATE', runId, traceId, force: true });
          await notifyClient.notify({
            category: 'run_partial_success',
            title: 'Run Completed (Partial Success)',
            message: `Run finished with partial success. ${Math.round(successRate * 100)}% workers succeeded.`,
            context: { runId, successRate: `${Math.round(successRate * 100)}%` },
          });
        }
      }

      expect(bus.consolidate).toHaveLength(1);
      const msg = bus.consolidate[0].body as ConsolidateMessage;
      expect(msg.force).toBe(true);
      expect(msg.runId).toBe(runId);
      expect(notifyClient.hasNotification('Partial Success')).toBe(true);
      expect(notifyClient.sent[0].message).toContain('80%');
    });

    it('should NOT trigger consolidation when <70% workers succeed', async () => {
      const bus = createMockServiceBus();
      const notifyClient = createMockNotifyClient();
      const traceId = generateTraceId();
      const runId = 'run-low-success';
      const expectedWorkers = 10;

      // 5 succeed, 5 fail = 50% success
      const completedWorkers = 5;
      const failedWorkers = 5;
      const successRate = completedWorkers / expectedWorkers;

      if (completedWorkers + failedWorkers >= expectedWorkers) {
        if (completedWorkers === expectedWorkers && failedWorkers === 0) {
          await bus.sendConsolidate({ type: 'CONSOLIDATE', runId, traceId });
        } else if (successRate >= AUTO_CONSOLIDATION_SUCCESS_THRESHOLD && completedWorkers > 0) {
          await bus.sendConsolidate({ type: 'CONSOLIDATE', runId, traceId, force: true });
        } else {
          await notifyClient.notify({
            category: 'run_failed',
            title: 'Run Failed',
            message: `Run ${runId} failed - success rate below threshold.`,
            context: { runId },
          });
        }
      }

      expect(bus.consolidate).toHaveLength(0);
      expect(notifyClient.hasNotification('Run Failed')).toBe(true);
    });

    it('should trigger immediate consolidation at exactly 70% threshold', async () => {
      const bus = createMockServiceBus();
      const traceId = generateTraceId();
      const runId = 'run-threshold';
      const expectedWorkers = 10;

      // 7 succeed, 3 fail = exactly 70%
      const completedWorkers = 7;
      const failedWorkers = 3;
      const successRate = completedWorkers / expectedWorkers;

      if (completedWorkers + failedWorkers >= expectedWorkers) {
        if (completedWorkers === expectedWorkers && failedWorkers === 0) {
          await bus.sendConsolidate({ type: 'CONSOLIDATE', runId, traceId });
        } else if (successRate >= AUTO_CONSOLIDATION_SUCCESS_THRESHOLD && completedWorkers > 0) {
          await bus.sendConsolidate({ type: 'CONSOLIDATE', runId, traceId, force: true });
        }
      }

      expect(bus.consolidate).toHaveLength(1);
      const msg = bus.consolidate[0].body as ConsolidateMessage;
      expect(msg.force).toBe(true);
    });
  });

  describe('Mock Notify Client', () => {
    it('should capture sent notifications', async () => {
      const notifyClient = createMockNotifyClient();

      await notifyClient.notify({ category: 'run_completed', title: 'Run Completed', message: 'All workers done.' });
      await notifyClient.notify({ category: 'consolidation_failed', title: 'Consolidation Failed', message: 'DB error.' });

      expect(notifyClient.sent).toHaveLength(2);
      expect(notifyClient.sent[0].title).toBe('Run Completed');
      expect(notifyClient.sent[1].message).toContain('DB error');
    });

    it('should filter notifications by title pattern (string)', async () => {
      const notifyClient = createMockNotifyClient();

      await notifyClient.notify({ category: 'run_completed', title: 'Run Completed', message: 'body1' });
      await notifyClient.notify({ category: 'run_failed', title: 'Run Failed', message: 'body2' });
      await notifyClient.notify({ category: 'consolidation_completed', title: 'Consolidation Completed', message: 'body3' });

      const runNotifs = notifyClient.getByTitle('Run');
      expect(runNotifs).toHaveLength(2);

      const failedNotifs = notifyClient.getByTitle('Failed');
      expect(failedNotifs).toHaveLength(1);
    });

    it('should filter notifications by title pattern (regex)', async () => {
      const notifyClient = createMockNotifyClient();

      await notifyClient.notify({ category: 'run_partial_success', title: 'Run Completed (Partial Success)', message: 'body' });
      await notifyClient.notify({ category: 'run_completed', title: 'Run Completed', message: 'body' });

      const partialNotifs = notifyClient.getByTitle(/Partial/);
      expect(partialNotifs).toHaveLength(1);
    });

    it('should check notification existence with hasNotification', async () => {
      const notifyClient = createMockNotifyClient();

      expect(notifyClient.hasNotification('Run Completed')).toBe(false);

      await notifyClient.notify({ category: 'run_completed', title: 'Run Completed', message: 'body' });

      expect(notifyClient.hasNotification('Run Completed')).toBe(true);
      expect(notifyClient.hasNotification('Nonexistent')).toBe(false);
    });

    it('should reset all notifications', async () => {
      const notifyClient = createMockNotifyClient();

      await notifyClient.notify({ category: 'run_completed', title: 'Test 1', message: 'body' });
      await notifyClient.notify({ category: 'run_failed', title: 'Test 2', message: 'body' });

      notifyClient.reset();

      expect(notifyClient.sent).toHaveLength(0);
    });

    it('should track notification timestamps', async () => {
      const notifyClient = createMockNotifyClient();
      const before = new Date();

      await notifyClient.notify({ category: 'run_completed', title: 'Test', message: 'body' });

      const after = new Date();
      expect(notifyClient.sent[0].sentAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(notifyClient.sent[0].sentAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should filter notifications by category', async () => {
      const notifyClient = createMockNotifyClient();

      await notifyClient.notify({ category: 'run_completed', title: 'Run Done', message: 'body' });
      await notifyClient.notify({ category: 'run_failed', title: 'Run Failed', message: 'body' });
      await notifyClient.notify({ category: 'run_completed', title: 'Another Run Done', message: 'body' });

      expect(notifyClient.getByCategory('run_completed')).toHaveLength(2);
      expect(notifyClient.getByCategory('run_failed')).toHaveLength(1);
    });
  });

  describe('Auto-Consolidation Constants', () => {
    it('should have sensible auto-consolidation defaults', () => {
      expect(AUTO_CONSOLIDATION_SUCCESS_THRESHOLD).toBe(0.70);
      expect(AUTO_CONSOLIDATION_DELAY_MINUTES).toBe(5);
      expect(AUTO_CONSOLIDATION_SUCCESS_THRESHOLD).toBeGreaterThan(0);
      expect(AUTO_CONSOLIDATION_SUCCESS_THRESHOLD).toBeLessThanOrEqual(1);
      expect(AUTO_CONSOLIDATION_DELAY_MINUTES).toBeGreaterThan(0);
    });
  });

  describe('Heatmap Partition Distribution', () => {
    it('should distribute work evenly across partitions', () => {
      const totalRecords = 10000;
      const maxWorkers = 5;
      const minRecordsPerWorker = 1000;

      // Simulate partition creation
      const recordsPerWorker = Math.ceil(totalRecords / maxWorkers);
      const actualWorkers = Math.min(
        maxWorkers,
        Math.ceil(totalRecords / minRecordsPerWorker)
      );

      const partitions: { partitionId: string; totalRecords: number }[] = [];
      let remaining = totalRecords;

      for (let i = 0; i < actualWorkers; i++) {
        const records = Math.min(recordsPerWorker, remaining);
        partitions.push({
          partitionId: `partition-${i}`,
          totalRecords: records,
        });
        remaining -= records;
      }

      // Verify distribution
      const totalDistributed = partitions.reduce((sum, p) => sum + p.totalRecords, 0);
      expect(totalDistributed).toBe(totalRecords);
      expect(partitions.length).toBe(actualWorkers);
    });
  });
});
