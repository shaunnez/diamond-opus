import { describe, it, expect, beforeEach } from 'vitest';
import { PricingEngine, getStoneType, getBaseMargin } from '../src/engine.js';
import type { PricingRule, Diamond } from '@diamond/shared';
import {
  NATURAL_BASE_MARGIN,
  LAB_BASE_MARGIN,
  FANCY_BASE_MARGIN,
} from '@diamond/shared';

const createMockRule = (overrides: Partial<PricingRule> = {}): PricingRule => ({
  id: 'test-rule',
  priority: 100,
  marginModifier: 0,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockDiamond = (overrides: Partial<Diamond> = {}): Diamond => ({
  id: 'test-diamond',
  feed: 'nivoda',
  supplierStoneId: 'stone-1',
  offerId: 'offer-1',
  shape: 'ROUND',
  carats: 1.0,
  color: 'G',
  clarity: 'VS1',
  labGrown: false,
  treated: false,
  feedPrice: 5000,
  pricePerCarat: 5000,
  availability: 'available',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PricingEngine', () => {
  let engine: PricingEngine;

  beforeEach(() => {
    engine = new PricingEngine();
  });

  describe('getStoneType', () => {
    it('should return fancy when diamond has fancyColor', () => {
      expect(getStoneType({ labGrown: false, fancyColor: 'Fancy Yellow' })).toBe('fancy');
    });

    it('should return fancy when lab grown diamond has fancyColor', () => {
      expect(getStoneType({ labGrown: true, fancyColor: 'Fancy Blue' })).toBe('fancy');
    });

    it('should return lab when diamond is lab grown without fancyColor', () => {
      expect(getStoneType({ labGrown: true })).toBe('lab');
    });

    it('should return natural for non-lab, non-fancy diamond', () => {
      expect(getStoneType({ labGrown: false })).toBe('natural');
    });
  });

  describe('getBaseMargin', () => {
    it('should return correct base margin for natural', () => {
      expect(getBaseMargin('natural')).toBe(NATURAL_BASE_MARGIN);
    });

    it('should return correct base margin for lab', () => {
      expect(getBaseMargin('lab')).toBe(LAB_BASE_MARGIN);
    });

    it('should return correct base margin for fancy', () => {
      expect(getBaseMargin('fancy')).toBe(FANCY_BASE_MARGIN);
    });
  });

  describe('findMatchingRule', () => {
    it('should throw if rules not loaded', () => {
      const diamond = createMockDiamond();
      expect(() => engine.findMatchingRule(diamond)).toThrow(
        'Pricing rules not loaded'
      );
    });

    it('should match a catch-all rule (no criteria)', () => {
      engine.setRules([createMockRule({ id: 'catch-all' })]);
      const diamond = createMockDiamond();
      expect(engine.findMatchingRule(diamond)?.id).toBe('catch-all');
    });

    it('should match rule by stone type', () => {
      engine.setRules([
        createMockRule({ id: 'lab', stoneType: 'lab', priority: 10 }),
        createMockRule({ id: 'natural', stoneType: 'natural', priority: 20 }),
      ]);

      const labDiamond = createMockDiamond({ labGrown: true });
      expect(engine.findMatchingRule(labDiamond)?.id).toBe('lab');

      const naturalDiamond = createMockDiamond({ labGrown: false });
      expect(engine.findMatchingRule(naturalDiamond)?.id).toBe('natural');
    });

    it('should match fancy diamonds by stone type', () => {
      engine.setRules([
        createMockRule({ id: 'fancy', stoneType: 'fancy', priority: 10 }),
        createMockRule({ id: 'lab', stoneType: 'lab', priority: 20 }),
      ]);

      // fancy takes priority over lab even if diamond is labGrown
      const fancyDiamond = createMockDiamond({ labGrown: true, fancyColor: 'Fancy Yellow' });
      expect(engine.findMatchingRule(fancyDiamond)?.id).toBe('fancy');
    });

    it('should match rule by price range (cost brackets)', () => {
      engine.setRules([
        createMockRule({ id: 'cheap', priceMin: 0, priceMax: 1000, priority: 10 }),
        createMockRule({ id: 'mid', priceMin: 1000, priceMax: 5000, priority: 20 }),
        createMockRule({ id: 'expensive', priceMin: 5000, priceMax: 10000, priority: 30 }),
      ]);

      const cheapDiamond = createMockDiamond({ feedPrice: 500 });
      expect(engine.findMatchingRule(cheapDiamond)?.id).toBe('cheap');

      const midDiamond = createMockDiamond({ feedPrice: 3000 });
      expect(engine.findMatchingRule(midDiamond)?.id).toBe('mid');

      const expensiveDiamond = createMockDiamond({ feedPrice: 8000 });
      expect(engine.findMatchingRule(expensiveDiamond)?.id).toBe('expensive');
    });

    it('should match rule by feed', () => {
      engine.setRules([
        createMockRule({ id: 'nivoda', feed: 'nivoda', priority: 10 }),
        createMockRule({ id: 'other', feed: 'other', priority: 20 }),
      ]);

      const diamond = createMockDiamond({ feed: 'nivoda' });
      expect(engine.findMatchingRule(diamond)?.id).toBe('nivoda');
    });

    it('should match combined criteria (stone type + price range)', () => {
      engine.setRules([
        createMockRule({ id: 'lab-cheap', stoneType: 'lab', priceMin: 0, priceMax: 1000, priority: 10 }),
        createMockRule({ id: 'lab-mid', stoneType: 'lab', priceMin: 1000, priceMax: 5000, priority: 20 }),
        createMockRule({ id: 'natural-any', stoneType: 'natural', priority: 30 }),
      ]);

      const cheapLabDiamond = createMockDiamond({ labGrown: true, feedPrice: 500 });
      expect(engine.findMatchingRule(cheapLabDiamond)?.id).toBe('lab-cheap');

      const midLabDiamond = createMockDiamond({ labGrown: true, feedPrice: 3000 });
      expect(engine.findMatchingRule(midLabDiamond)?.id).toBe('lab-mid');

      const naturalDiamond = createMockDiamond({ labGrown: false, feedPrice: 500 });
      expect(engine.findMatchingRule(naturalDiamond)?.id).toBe('natural-any');
    });

    it('should respect priority order (lower number wins)', () => {
      engine.setRules([
        createMockRule({ id: 'low-priority', marginModifier: 5, priority: 100 }),
        createMockRule({ id: 'high-priority', marginModifier: 10, priority: 1 }),
      ]);

      const diamond = createMockDiamond();
      expect(engine.findMatchingRule(diamond)?.id).toBe('high-priority');
    });

    it('should return undefined when no rule matches', () => {
      engine.setRules([
        createMockRule({ stoneType: 'lab', priority: 10 }),
      ]);

      const naturalDiamond = createMockDiamond({ labGrown: false });
      expect(engine.findMatchingRule(naturalDiamond)).toBeUndefined();
    });
  });

  describe('calculatePricing', () => {
    it('should use base margin with modifier for natural diamond', () => {
      engine.setRules([
        createMockRule({ stoneType: 'natural', marginModifier: 5 }),
      ]);

      const diamond = createMockDiamond({ feedPrice: 1000, labGrown: false });
      const pricing = engine.calculatePricing(diamond);

      // Natural base = 40%, modifier = +5%, effective = 45%
      // markupRatio = 1 + 45/100 = 1.45
      expect(pricing.stoneType).toBe('natural');
      expect(pricing.baseMargin).toBe(40);
      expect(pricing.marginModifier).toBe(5);
      expect(pricing.effectiveMargin).toBe(45);
      expect(pricing.markupRatio).toBe(1.45);
      expect(pricing.priceModelPrice).toBe(1450);
    });

    it('should use base margin with modifier for lab diamond', () => {
      engine.setRules([
        createMockRule({ stoneType: 'lab', marginModifier: 6 }),
      ]);

      const diamond = createMockDiamond({ feedPrice: 1000, labGrown: true });
      const pricing = engine.calculatePricing(diamond);

      // Lab base = 79%, modifier = +6%, effective = 85%
      // markupRatio = 1 + 85/100 = 1.85
      expect(pricing.stoneType).toBe('lab');
      expect(pricing.baseMargin).toBe(79);
      expect(pricing.marginModifier).toBe(6);
      expect(pricing.effectiveMargin).toBe(85);
      expect(pricing.markupRatio).toBe(1.85);
      expect(pricing.priceModelPrice).toBe(1850);
    });

    it('should handle negative margin modifier', () => {
      engine.setRules([
        createMockRule({ stoneType: 'lab', marginModifier: -4 }),
      ]);

      const diamond = createMockDiamond({ feedPrice: 1000, labGrown: true });
      const pricing = engine.calculatePricing(diamond);

      // Lab base = 79%, modifier = -4%, effective = 75%
      expect(pricing.effectiveMargin).toBe(75);
      expect(pricing.markupRatio).toBe(1.75);
      expect(pricing.priceModelPrice).toBe(1750);
    });

    it('should use base margin with 0 modifier when no rule matches', () => {
      engine.setRules([]); // No rules

      const diamond = createMockDiamond({ feedPrice: 1000, labGrown: false });
      const pricing = engine.calculatePricing(diamond);

      // Natural base = 40%, no modifier (default = 0)
      expect(pricing.stoneType).toBe('natural');
      expect(pricing.baseMargin).toBe(40);
      expect(pricing.marginModifier).toBe(0);
      expect(pricing.effectiveMargin).toBe(40);
      expect(pricing.markupRatio).toBe(1.40);
      expect(pricing.priceModelPrice).toBe(1400);
      expect(pricing.matchedRuleId).toBeUndefined();
    });

    it('should calculate price per carat correctly', () => {
      engine.setRules([createMockRule({ marginModifier: 0 })]);

      const diamond = createMockDiamond({ feedPrice: 5000, carats: 2.5, labGrown: false });
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.pricePerCarat).toBe(2000); // 5000 / 2.5
    });

    it('should include rating from matched rule', () => {
      engine.setRules([createMockRule({ marginModifier: 3, rating: 8 })]);

      const diamond = createMockDiamond({ feedPrice: 1000 });
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.pricingRating).toBe(8);
    });

    it('should include matched rule ID', () => {
      engine.setRules([createMockRule({ id: 'rule-123', marginModifier: 3 })]);

      const diamond = createMockDiamond({ feedPrice: 1000 });
      const pricing = engine.calculatePricing(diamond);

      expect(pricing.matchedRuleId).toBe('rule-123');
    });

    it('should handle the cost bracket table from requirements', () => {
      // Set up rules matching the requirements table for lab diamonds
      engine.setRules([
        createMockRule({ id: 'lab-1k', stoneType: 'lab', priceMax: 1000, marginModifier: 6, priority: 10 }),
        createMockRule({ id: 'lab-3k', stoneType: 'lab', priceMin: 1000, priceMax: 3000, marginModifier: 3, priority: 20 }),
        createMockRule({ id: 'lab-6k', stoneType: 'lab', priceMin: 3000, priceMax: 6000, marginModifier: 0, priority: 30 }),
        createMockRule({ id: 'lab-10k', stoneType: 'lab', priceMin: 6000, priceMax: 10000, marginModifier: -4, priority: 40 }),
      ]);

      // ≤ $1,000: +6% → 85% effective
      const d1 = createMockDiamond({ feedPrice: 800, labGrown: true, carats: 0.5 });
      const p1 = engine.calculatePricing(d1);
      expect(p1.effectiveMargin).toBe(85);
      expect(p1.priceModelPrice).toBe(1480); // 800 * 1.85

      // $1,000 – $3,000: +3% → 82% effective
      const d2 = createMockDiamond({ feedPrice: 2000, labGrown: true, carats: 1.0 });
      const p2 = engine.calculatePricing(d2);
      expect(p2.effectiveMargin).toBe(82);
      expect(p2.priceModelPrice).toBe(3640); // 2000 * 1.82

      // $3,000 – $6,000: 0% → 79% effective
      const d3 = createMockDiamond({ feedPrice: 4000, labGrown: true, carats: 1.5 });
      const p3 = engine.calculatePricing(d3);
      expect(p3.effectiveMargin).toBe(79);
      expect(p3.priceModelPrice).toBe(7160); // 4000 * 1.79

      // $6,000 – $10,000: -4% → 75% effective
      const d4 = createMockDiamond({ feedPrice: 8000, labGrown: true, carats: 2.0 });
      const p4 = engine.calculatePricing(d4);
      expect(p4.effectiveMargin).toBe(75);
      expect(p4.priceModelPrice).toBe(14000); // 8000 * 1.75
    });
  });

  describe('applyPricing', () => {
    it('should return diamond with pricing fields populated', () => {
      engine.setRules([createMockRule({ marginModifier: 5, rating: 7 })]);

      const diamond = createMockDiamond({ feedPrice: 1000, carats: 1.0, labGrown: false });
      const { id, createdAt, updatedAt, priceModelPrice, markupRatio, pricingRating, ...baseDiamond } = diamond;

      const result = engine.applyPricing(baseDiamond);

      // Natural base = 40%, modifier = +5%, effective = 45%, ratio = 1.45
      expect(result.priceModelPrice).toBe(1450);
      expect(result.markupRatio).toBe(1.45);
      expect(result.pricingRating).toBe(7);
      expect(result.pricePerCarat).toBe(1000); // 1000 / 1.0
      expect(result.feed).toBe('nivoda');
      expect(result.shape).toBe('ROUND');
    });
  });
});
