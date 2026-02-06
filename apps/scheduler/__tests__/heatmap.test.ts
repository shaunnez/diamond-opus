import { describe, it, expect, vi } from 'vitest';
import {
  createPartitions,
  calculateWorkerCount,
  type DensityChunk,
} from '@diamond/nivoda';

// Suppress console.log during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('calculateWorkerCount', () => {
  it('should return 0 for 0 records', () => {
    expect(calculateWorkerCount(0, 30, 1000)).toBe(0);
  });

  it('should return 1 for small record counts', () => {
    expect(calculateWorkerCount(500, 30, 1000)).toBe(1);
    expect(calculateWorkerCount(999, 30, 1000)).toBe(1);
  });

  it('should scale workers based on records', () => {
    expect(calculateWorkerCount(1000, 30, 1000)).toBe(1);
    expect(calculateWorkerCount(1001, 30, 1000)).toBe(2);
    expect(calculateWorkerCount(5000, 30, 1000)).toBe(5);
    expect(calculateWorkerCount(10000, 30, 1000)).toBe(10);
  });

  it('should cap at maxWorkers', () => {
    expect(calculateWorkerCount(100000, 30, 1000)).toBe(30);
    expect(calculateWorkerCount(1000000, 30, 1000)).toBe(30);
  });

  it('should respect custom minRecordsPerWorker', () => {
    expect(calculateWorkerCount(10000, 30, 5000)).toBe(2);
    expect(calculateWorkerCount(10000, 30, 500)).toBe(20);
  });
});

describe('createPartitions', () => {
  describe('edge cases', () => {
    it('should return empty array for empty density map', () => {
      const result = createPartitions([], 5);
      expect(result).toEqual([]);
    });

    it('should return empty array for 0 workers', () => {
      const densityMap: DensityChunk[] = [
        { min: 0, max: 100, count: 1000 },
      ];
      const result = createPartitions(densityMap, 0);
      expect(result).toEqual([]);
    });

    it('should handle single chunk', () => {
      const densityMap: DensityChunk[] = [
        { min: 0, max: 1000, count: 5000 },
      ];
      const result = createPartitions(densityMap, 3);

      // With chunk splitting enabled, a single large chunk CAN be split
      // Target = ceil(5000/3) = 1667, chunk 5000 > 1667*1.5 = 2500, so it splits
      // numSubChunks = ceil(5000/1667) = 3, countPerSubChunk = floor(5000/3) = 1666
      // Sub-chunks: [1666, 1666, 1668]
      // Greedy: sub-chunk 0 (1666) < target (1667), accumulate; + sub-chunk 1 = 3332 >= 1667, partition
      //         sub-chunk 2 (1668) is last, partition
      // Result: 2 partitions (split improves from 1 to 2)
      expect(result.length).toBe(2);

      // All records should be assigned
      const totalAssigned = result.reduce((sum, p) => sum + p.totalRecords, 0);
      expect(totalAssigned).toBe(5000);

      // Price range should span the full chunk
      expect(result[0].minPrice).toBe(0);
      expect(result[result.length - 1].maxPrice).toBe(1000);
    });

    it('should handle more workers than chunks', () => {
      const densityMap: DensityChunk[] = [
        { min: 0, max: 100, count: 1000 },
        { min: 100, max: 200, count: 1000 },
      ];
      const result = createPartitions(densityMap, 10);

      // With chunk splitting enabled, large chunks CAN be split to achieve more partitions
      // Target = 2000/10 = 200, chunks 1000 > 200*1.5 = 300, so each splits into ~5 sub-chunks
      expect(result.length).toBe(10);

      // All records should be assigned
      const totalAssigned = result.reduce((sum, p) => sum + p.totalRecords, 0);
      expect(totalAssigned).toBe(2000);
    });
  });

  describe('balanced partitioning', () => {
    it('should create balanced partitions for evenly distributed data', () => {
      const densityMap: DensityChunk[] = [
        { min: 0, max: 100, count: 1000 },
        { min: 100, max: 200, count: 1000 },
        { min: 200, max: 300, count: 1000 },
        { min: 300, max: 400, count: 1000 },
      ];
      const result = createPartitions(densityMap, 2);

      expect(result.length).toBe(2);
      expect(result[0].totalRecords).toBe(2000);
      expect(result[1].totalRecords).toBe(2000);
    });

    it('should handle uneven distribution', () => {
      const densityMap: DensityChunk[] = [
        { min: 0, max: 100, count: 100 },    // sparse
        { min: 100, max: 200, count: 5000 }, // very dense
        { min: 200, max: 300, count: 100 },  // sparse
        { min: 300, max: 400, count: 100 },  // sparse
      ];
      const result = createPartitions(densityMap, 3);

      // With chunk splitting: target = 5300/3 = 1767
      // Chunk 1 (5000 records) > 1767*1.5 = 2650, so it splits into ~3 sub-chunks
      // This allows achieving 3 partitions despite the uneven distribution
      expect(result.length).toBe(3);

      const totalAssigned = result.reduce((sum, p) => sum + p.totalRecords, 0);
      expect(totalAssigned).toBe(5300);
    });

    it('should preserve price range boundaries', () => {
      const densityMap: DensityChunk[] = [
        { min: 0, max: 1000, count: 2000 },
        { min: 1000, max: 5000, count: 3000 },
        { min: 5000, max: 10000, count: 1000 },
      ];
      const result = createPartitions(densityMap, 2);

      // Greedy algorithm: target = 6000/2 = 3000
      // Partition 0: chunk 0+1 = 5000 (exceeds target at chunk 1, partition created)
      // Partition 1: chunk 2 = 1000 (last chunk, partition created)
      expect(result.length).toBe(2);
      // First partition: $0 - $5000 (combines first two chunks)
      expect(result[0].minPrice).toBe(0);
      expect(result[0].maxPrice).toBe(5000);
      expect(result[0].totalRecords).toBe(5000);
      // Second partition: $5000 - $10000
      expect(result[1].minPrice).toBe(5000);
      expect(result[1].maxPrice).toBe(10000);
      expect(result[1].totalRecords).toBe(1000);
    });
  });

  describe('partition ID generation', () => {
    it('should generate sequential partition IDs', () => {
      const densityMap: DensityChunk[] = [
        { min: 0, max: 100, count: 1000 },
        { min: 100, max: 200, count: 1000 },
        { min: 200, max: 300, count: 1000 },
      ];
      const result = createPartitions(densityMap, 3);

      expect(result[0].partitionId).toBe('partition-0');
      expect(result[1].partitionId).toBe('partition-1');
      expect(result[2].partitionId).toBe('partition-2');
    });
  });

  describe('real-world scenarios', () => {
    it('should handle diamond-like distribution (dense at low prices)', () => {
      // Simulates typical diamond inventory: lots of cheap diamonds, few expensive
      const densityMap: DensityChunk[] = [
        { min: 0, max: 500, count: 10000 },
        { min: 500, max: 1000, count: 8000 },
        { min: 1000, max: 2000, count: 5000 },
        { min: 2000, max: 5000, count: 3000 },
        { min: 5000, max: 10000, count: 2000 },
        { min: 10000, max: 50000, count: 1500 },
        { min: 50000, max: 100000, count: 400 },
        { min: 100000, max: 250000, count: 100 },
      ];
      const result = createPartitions(densityMap, 5);

      // Greedy algorithm: target = 30000/5 = 6000
      // Partition 0: chunk 0 = 10000 (exceeds target, created)
      // Partition 1: chunk 1 = 8000 (exceeds target, created)
      // Partition 2: chunk 2 = 5000, chunk 3 = 8000 (exceeds target at chunk 3, created)
      // Partition 3: remaining chunks = 4000 (last, created)
      // With 8 chunks and greedy algorithm, we get 4 partitions
      expect(result.length).toBe(4);

      // Verify all records are assigned
      const totalAssigned = result.reduce((sum, p) => sum + p.totalRecords, 0);
      expect(totalAssigned).toBe(30000);

      // Verify no partition is empty
      for (const partition of result) {
        expect(partition.totalRecords).toBeGreaterThan(0);
      }
    });

    it('should handle sparse data with gaps', () => {
      // Gaps in price ranges (no diamonds at certain prices)
      const densityMap: DensityChunk[] = [
        { min: 0, max: 100, count: 500 },
        // Gap: 100-500 is empty (not in density map)
        { min: 500, max: 600, count: 300 },
        // Gap: 600-1000 is empty
        { min: 1000, max: 1500, count: 200 },
      ];
      const result = createPartitions(densityMap, 2);

      expect(result.length).toBe(2);

      // First partition: $0-$100 (500 records)
      expect(result[0].minPrice).toBe(0);
      expect(result[0].totalRecords).toBe(500);

      // Second partition: $500-$1500 (500 records combined)
      expect(result[1].minPrice).toBe(500);
      expect(result[1].totalRecords).toBe(500);
    });
  });
});
