import { describe, it, expect } from 'vitest';
import {
  FULL_RUN_START_DATE,
  INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES,
} from '@diamond/shared';

/**
 * Calculate the updatedFrom date based on run type and watermark.
 * This mirrors the logic in the scheduler's run() function.
 */
function calculateUpdatedFrom(
  runType: 'full' | 'incremental',
  watermarkLastUpdatedAt: string | undefined
): string {
  if (runType === 'full') {
    return FULL_RUN_START_DATE;
  } else if (watermarkLastUpdatedAt) {
    const watermarkTime = new Date(watermarkLastUpdatedAt);
    const safetyBufferMs = INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES * 60 * 1000;
    return new Date(watermarkTime.getTime() - safetyBufferMs).toISOString();
  } else {
    // Edge case: incremental requested but no watermark exists
    return FULL_RUN_START_DATE;
  }
}

describe('Date Range Calculation', () => {
  describe('FULL_RUN_START_DATE constant', () => {
    it('should be a valid ISO date string', () => {
      expect(FULL_RUN_START_DATE).toBe('2000-01-01T00:00:00.000Z');
      const date = new Date(FULL_RUN_START_DATE);
      expect(date.toISOString()).toBe(FULL_RUN_START_DATE);
    });
  });

  describe('INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES constant', () => {
    it('should be 15 minutes', () => {
      expect(INCREMENTAL_RUN_SAFETY_BUFFER_MINUTES).toBe(15);
    });
  });

  describe('calculateUpdatedFrom', () => {
    describe('full runs', () => {
      it('should return FULL_RUN_START_DATE for full run with no watermark', () => {
        const result = calculateUpdatedFrom('full', undefined);
        expect(result).toBe(FULL_RUN_START_DATE);
      });

      it('should return FULL_RUN_START_DATE for full run even with watermark', () => {
        const result = calculateUpdatedFrom('full', '2024-06-01T10:00:00.000Z');
        expect(result).toBe(FULL_RUN_START_DATE);
      });
    });

    describe('incremental runs', () => {
      it('should subtract 15 minute safety buffer from watermark', () => {
        const watermarkTime = '2024-06-01T10:00:00.000Z';
        const result = calculateUpdatedFrom('incremental', watermarkTime);

        // Expected: 2024-06-01T10:00:00.000Z - 15 minutes = 2024-06-01T09:45:00.000Z
        expect(result).toBe('2024-06-01T09:45:00.000Z');
      });

      it('should handle watermark at midnight correctly', () => {
        const watermarkTime = '2024-06-01T00:10:00.000Z';
        const result = calculateUpdatedFrom('incremental', watermarkTime);

        // Expected: crosses into previous day
        expect(result).toBe('2024-05-31T23:55:00.000Z');
      });

      it('should handle watermark at start of year correctly', () => {
        const watermarkTime = '2024-01-01T00:10:00.000Z';
        const result = calculateUpdatedFrom('incremental', watermarkTime);

        // Expected: crosses into previous year
        expect(result).toBe('2023-12-31T23:55:00.000Z');
      });

      it('should fall back to FULL_RUN_START_DATE when incremental but no watermark', () => {
        const result = calculateUpdatedFrom('incremental', undefined);
        expect(result).toBe(FULL_RUN_START_DATE);
      });

      it('should fall back to FULL_RUN_START_DATE when watermark is empty string', () => {
        const result = calculateUpdatedFrom('incremental', '');
        expect(result).toBe(FULL_RUN_START_DATE);
      });
    });

    describe('edge cases', () => {
      it('should handle ISO dates with milliseconds', () => {
        const watermarkTime = '2024-06-01T10:00:00.123Z';
        const result = calculateUpdatedFrom('incremental', watermarkTime);

        // Should still subtract 15 minutes correctly
        const resultDate = new Date(result);
        const expectedDate = new Date('2024-06-01T09:45:00.123Z');
        expect(resultDate.getTime()).toBe(expectedDate.getTime());
      });

      it('should produce valid ISO strings that can be parsed', () => {
        const watermarkTime = '2024-06-15T14:30:00.000Z';
        const result = calculateUpdatedFrom('incremental', watermarkTime);

        // Result should be parseable
        const parsed = new Date(result);
        expect(parsed.toISOString()).toBe(result);
        expect(isNaN(parsed.getTime())).toBe(false);
      });
    });
  });

  describe('integration: full date range workflow', () => {
    it('should create valid updatedAt range for full run', () => {
      const runStartTime = new Date('2024-06-15T12:00:00.000Z');
      const updatedFrom = calculateUpdatedFrom('full', undefined);
      const updatedTo = runStartTime.toISOString();

      expect(updatedFrom).toBe('2000-01-01T00:00:00.000Z');
      expect(updatedTo).toBe('2024-06-15T12:00:00.000Z');

      // Verify from < to
      expect(new Date(updatedFrom).getTime()).toBeLessThan(new Date(updatedTo).getTime());
    });

    it('should create valid updatedAt range for incremental run', () => {
      const watermarkTime = '2024-06-14T10:00:00.000Z';
      const runStartTime = new Date('2024-06-15T12:00:00.000Z');

      const updatedFrom = calculateUpdatedFrom('incremental', watermarkTime);
      const updatedTo = runStartTime.toISOString();

      expect(updatedFrom).toBe('2024-06-14T09:45:00.000Z');
      expect(updatedTo).toBe('2024-06-15T12:00:00.000Z');

      // Verify from < to
      expect(new Date(updatedFrom).getTime()).toBeLessThan(new Date(updatedTo).getTime());
    });

    it('should handle incremental run without watermark gracefully', () => {
      const runStartTime = new Date('2024-06-15T12:00:00.000Z');
      const updatedFrom = calculateUpdatedFrom('incremental', undefined);
      const updatedTo = runStartTime.toISOString();

      // Falls back to full run date range
      expect(updatedFrom).toBe('2000-01-01T00:00:00.000Z');
      expect(updatedTo).toBe('2024-06-15T12:00:00.000Z');

      // Verify from < to
      expect(new Date(updatedFrom).getTime()).toBeLessThan(new Date(updatedTo).getTime());
    });
  });
});
