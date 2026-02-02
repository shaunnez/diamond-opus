import { describe, it, expect, beforeEach } from 'vitest';
import { PricingEngine } from '../src/engine.js';
import type { PricingRule, Diamond } from '@diamond/shared';

const createMockRule = (overrides: Partial<PricingRule> = {}): PricingRule => ({
  id: 'rule-1',
  priority: 100,
  markupRatio: 1.2,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockDiamond = (
  overrides: Partial<Pick<Diamond, 'carats' | 'shape' | 'labGrown' | 'feed' | 'feedPriceCents'>> = {}
): Pick<Diamond, 'carats' | 'shape' | 'labGrown' | 'feed' | 'feedPriceCents'> => ({
  carats: 1.0,
  shape: 'ROUND',
  labGrown: false,
  feed: 'nivoda',
  feedPriceCents: 100000,
  ...overrides,
});

describe('PricingEngine', () => {
  let engine: PricingEngine;

  beforeEach(() => {
    engine = new PricingEngine();
  });

  describe('rule matching', () => {
    it('should match rule with no criteria', () => {
      engine.setRules([createMockRule()]);

      const diamond = createMockDiamond();
      const rule = engine.findMatchingRule(diamond);

      expect(rule).toBeDefined();
      expect(rule?.id).toBe('rule-1');
    });

    it('should match rule by carat range', () => {
      engine.setRules([
        createMockRule({ id: 'small', caratMin: 0.5, caratMax: 1.0, priority: 10 }),
        createMockRule({ id: 'large', caratMin: 1.01, caratMax: 3.0, priority: 20 }),
      ]);

      const smallDiamond = createMockDiamond({ carats: 0.75 });
      expect(engine.findMatchingRule(smallDiamond)?.id).toBe('small');

      const largeDiamond = createMockDiamond({ carats: 2.0 });
      expect(engine.findMatchingRule(largeDiamond)?.id).toBe('large');
    });

    it('should match rule by shape', () => {
      engine.setRules([
        createMockRule({ id: 'round', shapes: ['ROUND'], priority: 10 }),
        createMockRule({ id: 'fancy', shapes: ['OVAL', 'PEAR', 'MARQUISE'], priority: 20 }),
      ]);

      const roundDiamond = createMockDiamond({ shape: 'ROUND' });
      expect(engine.findMatchingRule(roundDiamond)?.id).toBe('round');

      const ovalDiamond = createMockDiamond({ shape: 'OVAL' });
      expect(engine.findMatchingRule(ovalDiamond)?.id).toBe('fancy');
    });

    it('should match rule by lab grown status', () => {
      engine.setRules([
        createMockRule({ id: 'natural', labGrown: false, priority: 10 }),
        createMockRule({ id: 'lab', labGrown: true, priority: 20 }),
      ]);

      const naturalDiamond = createMockDiamond({ labGrown: false });
      expect(engine.findMatchingRule(naturalDiamond)?.id).toBe('natural');

      const labDiamond = createMockDiamond({ labGrown: true });
      expect(engine.findMatchingRule(labDiamond)?.id).toBe('lab');
    });

    it('should match rule by feed', () => {
      engine.setRules([
        createMockRule({ id: 'nivoda', feed: 'nivoda', priority: 10 }),
        createMockRule({ id: 'other', feed: 'other-feed', priority: 20 }),
      ]);

      const nivodaDiamond = createMockDiamond({ feed: 'nivoda' });
      expect(engine.findMatchingRule(nivodaDiamond)?.id).toBe('nivoda');
    });

    it('should respect priority order (lower priority wins)', () => {
      engine.setRules([
        createMockRule({ id: 'high-priority', priority: 10, markupRatio: 1.1 }),
        createMockRule({ id: 'low-priority', priority: 100, markupRatio: 1.5 }),
      ]);

      const diamond = createMockDiamond();
      const rule = engine.findMatchingRule(diamond);

      expect(rule?.id).toBe('high-priority');
    });

    it('should return undefined when no rule matches', () => {
      engine.setRules([
        createMockRule({ shapes: ['EMERALD'], priority: 10 }),
      ]);

      const diamond = createMockDiamond({ shape: 'ROUND' });
      const rule = engine.findMatchingRule(diamond);

      expect(rule).toBeUndefined();
    });
  });

  describe('pricing calculation', () => {
    it('should calculate retail price with markup', () => {
      engine.setRules([createMockRule({ markupRatio: 1.25 })]);

      const diamond = createMockDiamond({ feedPriceCents: 100000 });
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.retailPriceCents).toBe(125000);
      expect(pricing.markupRatio).toBe(1.25);
    });

    it('should calculate price per carat', () => {
      engine.setRules([createMockRule()]);

      const diamond = createMockDiamond({ feedPriceCents: 150000, carats: 1.5 });
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.pricePerCaratCents).toBe(100000);
    });

    it('should include rating from matched rule', () => {
      engine.setRules([createMockRule({ rating: 8 })]);

      const diamond = createMockDiamond();
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.rating).toBe(8);
    });

    it('should include matched rule id', () => {
      engine.setRules([createMockRule({ id: 'test-rule' })]);

      const diamond = createMockDiamond();
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.matchedRuleId).toBe('test-rule');
    });

    it('should use default markup when no rule matches', () => {
      engine.setRules([createMockRule({ shapes: ['EMERALD'] })]);

      const diamond = createMockDiamond({ shape: 'ROUND', feedPriceCents: 100000 });
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.markupRatio).toBe(1.15);
      expect(pricing.retailPriceCents).toBe(115000);
      expect(pricing.matchedRuleId).toBeUndefined();
    });
  });

  describe('applyPricing', () => {
    it('should return diamond with pricing fields populated', () => {
      engine.setRules([createMockRule({ markupRatio: 1.3, rating: 7 })]);

      const baseDiamond = {
        feed: 'nivoda',
        supplierStoneId: 'test-123',
        offerId: 'offer-456',
        shape: 'ROUND',
        carats: 1.0,
        color: 'D',
        clarity: 'VS1',
        labGrown: false,
        treated: false,
        feedPriceCents: 100000,
        pricePerCaratCents: 100000,
        availability: 'available' as const,
        status: 'active' as const,
      };

      const pricedDiamond = engine.applyPricing(baseDiamond);

      expect(pricedDiamond.retailPriceCents).toBe(130000);
      expect(pricedDiamond.markupRatio).toBe(1.3);
      expect(pricedDiamond.rating).toBe(7);
    });
  });

  describe('error handling', () => {
    it('should throw error if rules not loaded', () => {
      const diamond = createMockDiamond();

      expect(() => engine.findMatchingRule(diamond)).toThrow(
        'Pricing rules not loaded. Call loadRules() first.'
      );
    });
  });
});
