/**
 * E2E Pipeline Test — Full Run via API Trigger
 *
 * This test exercises the complete pipeline end-to-end:
 *   1. Seeds demo data via demo-feed-api
 *   2. Verifies the scheduler created a run (the local-e2e.sh script
 *      triggers the scheduler before tests run)
 *   3. Polls until all partitions are completed
 *   4. Verifies diamonds exist in the final table
 *   5. Verifies watermark blob exists in Azurite
 *
 * Prerequisites:
 *   - Full docker-compose stack running (run via npm run local:e2e)
 *   - Scheduler has already been triggered by the test runner script
 *
 * Environment variables (set by local-e2e.sh):
 *   DATABASE_URL, AZURE_STORAGE_CONNECTION_STRING, API_BASE_URL
 */

import { describe, it, expect, afterAll } from 'vitest';
import { BlobServiceClient } from '@azure/storage-blob';
import { query, closePool, pollUntil } from './helpers.js';

afterAll(async () => {
  await closePool();
});

describe('E2E Pipeline', () => {
  let runId: string;

  it('should have a demo run created by the scheduler', async () => {
    // The scheduler container runs before tests start. Find the most recent demo run.
    await pollUntil(
      async () => {
        const result = await query<{ run_id: string }>(
          `SELECT run_id FROM run_metadata
           WHERE feed = 'demo'
           ORDER BY started_at DESC
           LIMIT 1`
        );
        if (result.rows.length > 0) {
          runId = result.rows[0]!.run_id;
          return true;
        }
        return false;
      },
      { label: 'demo run exists in run_metadata', timeoutMs: 30_000 }
    );

    expect(runId).toBeDefined();
  });

  it('should complete all partitions without failures', async () => {
    // Poll until all partitions for this run are completed (or failed)
    await pollUntil(
      async () => {
        const result = await query<{
          total: string;
          completed: string;
          failed: string;
        }>(
          `SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE completed)::text AS completed,
             COUNT(*) FILTER (WHERE failed)::text AS failed
           FROM partition_progress
           WHERE run_id = $1`,
          [runId]
        );

        const row = result.rows[0];
        if (!row) return false;

        const total = parseInt(row.total, 10);
        const completed = parseInt(row.completed, 10);
        const failed = parseInt(row.failed, 10);

        // All partitions done (completed or failed)
        return total > 0 && completed + failed >= total;
      },
      { label: 'all partitions completed', timeoutMs: 90_000, intervalMs: 3_000 }
    );

    // Assert no partitions failed
    const result = await query<{ failed_count: string }>(
      `SELECT COUNT(*)::text AS failed_count
       FROM partition_progress
       WHERE run_id = $1 AND failed = true`,
      [runId]
    );
    const failedCount = parseInt(result.rows[0]?.failed_count ?? '0', 10);
    expect(failedCount).toBe(0);
  });

  it('should not have any partition with offset exceeding bounds', async () => {
    // next_offset should be reasonable for 500 seeded records
    const result = await query<{
      partition_id: string;
      next_offset: number;
    }>(
      `SELECT partition_id, next_offset
       FROM partition_progress
       WHERE run_id = $1 AND next_offset > 1000`,
      [runId]
    );
    expect(result.rows).toHaveLength(0);
  });

  it('should have diamonds in the final table', async () => {
    // Wait for consolidation to produce diamonds
    await pollUntil(
      async () => {
        const result = await query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM diamonds WHERE feed = 'demo'`
        );
        return parseInt(result.rows[0]?.count ?? '0', 10) > 0;
      },
      { label: 'diamonds table populated', timeoutMs: 90_000, intervalMs: 3_000 }
    );

    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM diamonds WHERE feed = 'demo'`
    );
    const count = parseInt(result.rows[0]?.count ?? '0', 10);
    expect(count).toBeGreaterThan(0);
  });

  it('should have a watermark blob in Azurite', async () => {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connectionString) {
      // Skip if Azurite is not configured (e.g., running tests outside docker stack)
      console.warn('AZURE_STORAGE_CONNECTION_STRING not set, skipping watermark check');
      return;
    }

    // Wait for the consolidator to save the watermark
    await pollUntil(
      async () => {
        try {
          const blobClient = BlobServiceClient.fromConnectionString(connectionString);
          const containerClient = blobClient.getContainerClient('watermarks');
          const blob = containerClient.getBlobClient('demo.json');
          const exists = await blob.exists();
          return exists;
        } catch {
          return false;
        }
      },
      { label: 'watermark blob exists', timeoutMs: 90_000, intervalMs: 3_000 }
    );

    // Verify the watermark content
    const blobClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobClient.getContainerClient('watermarks');
    const blob = containerClient.getBlobClient('demo.json');
    const downloadResponse = await blob.download();

    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody!) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks).toString('utf8');
    const watermark = JSON.parse(content);

    expect(watermark).toHaveProperty('lastUpdatedAt');
    expect(watermark).toHaveProperty('lastRunId');
    expect(watermark.lastRunId).toBe(runId);
  });
});
