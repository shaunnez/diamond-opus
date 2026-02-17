import { describe, it, expect, beforeEach } from 'vitest';
import { RatingEngine } from '../src/engine';
import type { RatingRule, Diamond } from '@diamond/shared';

describe('RatingEngine', () => {
  let engine: RatingEngine;

  beforeEach(() => {
    engine = new RatingEngine();
  });

  describe('setRules', () => {
    it('should set rules and mark as loaded', () => {
      const rules: RatingRule[] = [
        {
          id: '1',
          priority: 1,
          rating: 5,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      engine.setRules(rules);

      // Should not throw
      expect(() => engine.findMatchingRule({ feedPrice: 100, feed: 'nivoda' })).not.toThrow();
    });

    it('should sort rules by priority ascending', () => {
      const rules: RatingRule[] = [
        {
          id: '3',
          priority: 30,
          rating: 3,
          priceMin: 5000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '1',
          priority: 10,
          rating: 5,
          priceMin: 1000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          priority: 20,
          rating: 4,
          priceMin: 3000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      engine.setRules(rules);

      // Rule with priority 10 should match first
      const result = engine.findMatchingRule({ feedPrice: 6000, feed: 'nivoda' });
      expect(result?.id).toBe('1');
    });
  });

  describe('findMatchingRule', () => {
    it('should throw if rules not loaded', () => {
      expect(() => engine.findMatchingRule({ feedPrice: 100, feed: 'nivoda' })).toThrow(
        'Rating rules not loaded. Call loadRules() first.'
      );
    });

    it('should return undefined if no rules match', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMin: 10000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.findMatchingRule({ feedPrice: 100, feed: 'nivoda' });
      expect(result).toBeUndefined();
    });

    it('should match rule with no filters', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.findMatchingRule({ feedPrice: 100, feed: 'nivoda' });
      expect(result?.id).toBe('1');
    });

    it('should match rule by price min', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMin: 1000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const match = engine.findMatchingRule({ feedPrice: 1000, feed: 'nivoda' });
      const noMatch = engine.findMatchingRule({ feedPrice: 999, feed: 'nivoda' });

      expect(match?.id).toBe('1');
      expect(noMatch).toBeUndefined();
    });

    it('should match rule by price max', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMax: 5000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const match = engine.findMatchingRule({ feedPrice: 5000, feed: 'nivoda' });
      const noMatch = engine.findMatchingRule({ feedPrice: 5001, feed: 'nivoda' });

      expect(match?.id).toBe('1');
      expect(noMatch).toBeUndefined();
    });

    it('should match rule by price range', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMin: 1000,
          priceMax: 5000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      expect(engine.findMatchingRule({ feedPrice: 999, feed: 'nivoda' })).toBeUndefined();
      expect(engine.findMatchingRule({ feedPrice: 1000, feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 3000, feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 5000, feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 5001, feed: 'nivoda' })).toBeUndefined();
    });

    it('should match rule by shape (case insensitive)', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          shapes: ['ROUND', 'PRINCESS'],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      expect(engine.findMatchingRule({ feedPrice: 100, shape: 'round', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, shape: 'ROUND', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, shape: 'princess', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, shape: 'oval', feed: 'nivoda' })).toBeUndefined();
      expect(engine.findMatchingRule({ feedPrice: 100, shape: undefined, feed: 'nivoda' })).toBeUndefined();
    });

    it('should match rule by color (case insensitive)', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          colors: ['D', 'E', 'F'],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      expect(engine.findMatchingRule({ feedPrice: 100, color: 'd', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, color: 'E', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, color: 'G', feed: 'nivoda' })).toBeUndefined();
      expect(engine.findMatchingRule({ feedPrice: 100, color: undefined, feed: 'nivoda' })).toBeUndefined();
    });

    it('should match rule by clarity (case insensitive)', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          clarities: ['IF', 'VVS1', 'VVS2'],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      expect(engine.findMatchingRule({ feedPrice: 100, clarity: 'if', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, clarity: 'VVS1', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, clarity: 'VS1', feed: 'nivoda' })).toBeUndefined();
      expect(engine.findMatchingRule({ feedPrice: 100, clarity: undefined, feed: 'nivoda' })).toBeUndefined();
    });

    it('should match rule by cut (case insensitive)', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          cuts: ['IDEAL', 'EXCELLENT'],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      expect(engine.findMatchingRule({ feedPrice: 100, cut: 'ideal', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, cut: 'EXCELLENT', feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, cut: 'GOOD', feed: 'nivoda' })).toBeUndefined();
      expect(engine.findMatchingRule({ feedPrice: 100, cut: undefined, feed: 'nivoda' })).toBeUndefined();
    });

    it('should match rule by feed', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          feed: 'nivoda',
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      expect(engine.findMatchingRule({ feedPrice: 100, feed: 'nivoda' })?.id).toBe('1');
      expect(engine.findMatchingRule({ feedPrice: 100, feed: 'other-feed' })).toBeUndefined();
    });

    it('should match rule with multiple filters', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMin: 1000,
          priceMax: 5000,
          shapes: ['ROUND'],
          colors: ['D', 'E'],
          clarities: ['IF', 'VVS1'],
          cuts: ['IDEAL'],
          feed: 'nivoda',
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const validDiamond: Partial<Diamond> = {
        feedPrice: 3000,
        shape: 'round',
        color: 'D',
        clarity: 'IF',
        cut: 'ideal',
        feed: 'nivoda',
      };

      expect(engine.findMatchingRule(validDiamond as any)?.id).toBe('1');

      // Fail each filter one at a time
      expect(engine.findMatchingRule({ ...validDiamond, feedPrice: 999 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...validDiamond, feedPrice: 5001 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...validDiamond, shape: 'princess' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...validDiamond, color: 'F' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...validDiamond, clarity: 'VVS2' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...validDiamond, cut: 'excellent' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...validDiamond, feed: 'other' } as any)).toBeUndefined();
    });

    it('should return first matching rule by priority', () => {
      engine.setRules([
        {
          id: 'low-priority',
          priority: 100,
          rating: 1,
          priceMin: 1000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'high-priority',
          priority: 10,
          rating: 5,
          priceMin: 1000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'medium-priority',
          priority: 50,
          rating: 3,
          priceMin: 1000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.findMatchingRule({ feedPrice: 2000, feed: 'nivoda' });
      expect(result?.id).toBe('high-priority');
      expect(result?.rating).toBe(5);
    });

    it('should skip non-matching rules and return first match', () => {
      engine.setRules([
        {
          id: '1',
          priority: 10,
          rating: 1,
          shapes: ['PRINCESS'],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          priority: 20,
          rating: 3,
          shapes: ['ROUND'],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          priority: 30,
          rating: 5,
          shapes: ['ROUND', 'OVAL'],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.findMatchingRule({ feedPrice: 100, shape: 'round', feed: 'nivoda' });
      expect(result?.id).toBe('2');
    });
  });

  describe('calculateRating', () => {
    it('should return undefined if no rule matches', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMin: 10000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.calculateRating({ feedPrice: 100, feed: 'nivoda' });
      expect(result).toBeUndefined();
    });

    it('should return rating from matching rule', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMin: 1000,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.calculateRating({ feedPrice: 2000, feed: 'nivoda' });
      expect(result).toBe(5);
    });

    it('should return rating from highest priority matching rule', () => {
      engine.setRules([
        {
          id: '1',
          priority: 10,
          rating: 3,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          priority: 5,
          rating: 5,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.calculateRating({ feedPrice: 100, feed: 'nivoda' });
      expect(result).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty rules array', () => {
      engine.setRules([]);

      const result = engine.findMatchingRule({ feedPrice: 100, feed: 'nivoda' });
      expect(result).toBeUndefined();
    });

    it('should handle rules with empty filter arrays', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          shapes: [],
          colors: [],
          clarities: [],
          cuts: [],
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Empty arrays should not filter anything (match all)
      const result = engine.findMatchingRule({ feedPrice: 100, feed: 'nivoda' });
      expect(result?.id).toBe('1');
    });

    it('should handle diamond with all undefined attributes', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.findMatchingRule({
        feedPrice: 100,
        shape: undefined,
        color: undefined,
        clarity: undefined,
        cut: undefined,
        feed: 'nivoda',
      });
      expect(result?.id).toBe('1');
    });

    it('should handle zero price', () => {
      engine.setRules([
        {
          id: '1',
          priority: 1,
          rating: 5,
          priceMin: 0,
          priceMax: 100,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = engine.findMatchingRule({ feedPrice: 0, feed: 'nivoda' });
      expect(result?.id).toBe('1');
    });

    it('should not mutate original rules array', () => {
      const originalRules: RatingRule[] = [
        {
          id: '3',
          priority: 30,
          rating: 3,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '1',
          priority: 10,
          rating: 1,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      engine.setRules(originalRules);

      // Original array should not be sorted
      expect(originalRules[0].id).toBe('3');
      expect(originalRules[1].id).toBe('1');
    });
  });
});
