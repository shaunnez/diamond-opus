import { describe, it, expect, beforeEach } from 'vitest';
import { RatingEngine } from '../src/engine';
import type { RatingRule, Diamond } from '@diamond/shared';

function makeRule(overrides: Partial<RatingRule> & { id: string; rating: number }): RatingRule {
  return {
    priority: 1,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

type TestDiamond = Partial<Diamond> & { feedPrice: number; feed: string; labGrown: boolean };

function makeDiamond(overrides: Partial<TestDiamond> = {}): TestDiamond {
  return {
    feedPrice: 1000,
    feed: 'nivoda',
    shape: 'ROUND',
    color: 'D',
    clarity: 'VS1',
    cut: 'EXCELLENT',
    labGrown: false,
    ...overrides,
  };
}

describe('RatingEngine', () => {
  let engine: RatingEngine;

  beforeEach(() => {
    engine = new RatingEngine();
  });

  describe('setRules', () => {
    it('should set rules and mark as loaded', () => {
      const rules: RatingRule[] = [makeRule({ id: '1', rating: 5 })];
      engine.setRules(rules);
      expect(() => engine.findMatchingRule(makeDiamond())).not.toThrow();
    });

    it('should sort rules by priority ascending', () => {
      engine.setRules([
        makeRule({ id: '3', priority: 30, rating: 3, priceMin: 5000 }),
        makeRule({ id: '1', priority: 10, rating: 5, priceMin: 1000 }),
        makeRule({ id: '2', priority: 20, rating: 4, priceMin: 3000 }),
      ]);
      const result = engine.findMatchingRule(makeDiamond({ feedPrice: 6000 }));
      expect(result?.id).toBe('1');
    });
  });

  describe('findMatchingRule', () => {
    it('should throw if rules not loaded', () => {
      expect(() => engine.findMatchingRule(makeDiamond())).toThrow(
        'Rating rules not loaded. Call loadRules() first.'
      );
    });

    it('should return undefined if no rules match', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, priceMin: 10000 })]);
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 100 }))).toBeUndefined();
    });

    it('should match rule with no filters', () => {
      engine.setRules([makeRule({ id: '1', rating: 5 })]);
      expect(engine.findMatchingRule(makeDiamond())?.id).toBe('1');
    });

    it('should match rule by price min', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, priceMin: 1000 })]);
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 1000 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 999 }))).toBeUndefined();
    });

    it('should match rule by price max', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, priceMax: 5000 })]);
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 5000 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 5001 }))).toBeUndefined();
    });

    it('should match rule by price range', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, priceMin: 1000, priceMax: 5000 })]);
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 999 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 1000 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 3000 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 5000 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 5001 }))).toBeUndefined();
    });

    it('should match rule by shape (case insensitive)', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, shapes: ['ROUND', 'PRINCESS'] })]);
      expect(engine.findMatchingRule(makeDiamond({ shape: 'round' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ shape: 'ROUND' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ shape: 'princess' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ shape: 'oval' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ shape: undefined }))).toBeUndefined();
    });

    it('should match rule by color (case insensitive)', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, colors: ['D', 'E', 'F'] })]);
      expect(engine.findMatchingRule(makeDiamond({ color: 'd' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ color: 'E' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ color: 'G' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ color: undefined }))).toBeUndefined();
    });

    it('should match rule by clarity (case insensitive)', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, clarities: ['IF', 'VVS1', 'VVS2'] })]);
      expect(engine.findMatchingRule(makeDiamond({ clarity: 'if' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ clarity: 'VVS1' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ clarity: 'VS1' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ clarity: undefined }))).toBeUndefined();
    });

    it('should match rule by cut with grade normalisation', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, cuts: ['IDEAL', 'EXCELLENT'] })]);
      expect(engine.findMatchingRule(makeDiamond({ cut: 'ideal' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ cut: 'EXCELLENT' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ cut: 'EX' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ cut: 'ID' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ cut: 'GOOD' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ cut: undefined }))).toBeUndefined();
    });

    it('should match rule by feed', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, feed: 'nivoda' })]);
      expect(engine.findMatchingRule(makeDiamond({ feed: 'nivoda' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ feed: 'other-feed' }))).toBeUndefined();
    });

    it('should match rule with multiple filters', () => {
      engine.setRules([
        makeRule({
          id: '1',
          rating: 5,
          priceMin: 1000,
          priceMax: 5000,
          shapes: ['ROUND'],
          colors: ['D', 'E'],
          clarities: ['IF', 'VVS1'],
          cuts: ['IDEAL'],
          feed: 'nivoda',
        }),
      ]);

      const valid = makeDiamond({
        feedPrice: 3000,
        shape: 'round',
        color: 'D',
        clarity: 'IF',
        cut: 'ideal',
        feed: 'nivoda',
      });

      expect(engine.findMatchingRule(valid)?.id).toBe('1');
      expect(engine.findMatchingRule({ ...valid, feedPrice: 999 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...valid, feedPrice: 5001 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...valid, shape: 'princess' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...valid, color: 'F' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...valid, clarity: 'VVS2' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...valid, cut: 'excellent' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...valid, feed: 'other' } as any)).toBeUndefined();
    });

    it('should return first matching rule by priority', () => {
      engine.setRules([
        makeRule({ id: 'low-priority', priority: 100, rating: 1, priceMin: 1000 }),
        makeRule({ id: 'high-priority', priority: 10, rating: 5, priceMin: 1000 }),
        makeRule({ id: 'medium-priority', priority: 50, rating: 3, priceMin: 1000 }),
      ]);

      const result = engine.findMatchingRule(makeDiamond({ feedPrice: 2000 }));
      expect(result?.id).toBe('high-priority');
      expect(result?.rating).toBe(5);
    });

    it('should skip non-matching rules and return first match', () => {
      engine.setRules([
        makeRule({ id: '1', priority: 10, rating: 1, shapes: ['PRINCESS'] }),
        makeRule({ id: '2', priority: 20, rating: 3, shapes: ['ROUND'] }),
        makeRule({ id: '3', priority: 30, rating: 5, shapes: ['ROUND', 'OVAL'] }),
      ]);

      const result = engine.findMatchingRule(makeDiamond({ shape: 'round' }));
      expect(result?.id).toBe('2');
    });
  });

  // --- Tier 1: Grading filters ---

  describe('polish filter', () => {
    it('should match by polish with grade normalisation', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, polishes: ['EXCELLENT', 'VERY GOOD'] })]);

      expect(engine.findMatchingRule(makeDiamond({ polish: 'EXCELLENT' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ polish: 'EX' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ polish: 'VG' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ polish: 'GOOD' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ polish: undefined }))).toBeUndefined();
    });

    it('should match all if polishes not set', () => {
      engine.setRules([makeRule({ id: '1', rating: 5 })]);
      expect(engine.findMatchingRule(makeDiamond({ polish: 'FAIR' }))?.id).toBe('1');
    });
  });

  describe('symmetry filter', () => {
    it('should match by symmetry with grade normalisation', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, symmetries: ['EXCELLENT'] })]);

      expect(engine.findMatchingRule(makeDiamond({ symmetry: 'EXCELLENT' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ symmetry: 'EX' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ symmetry: 'VG' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ symmetry: undefined }))).toBeUndefined();
    });
  });

  describe('fluorescence filter', () => {
    it('should match by fluorescence (case insensitive, no grade normalisation)', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, fluorescences: ['NONE', 'FAINT'] })]);

      expect(engine.findMatchingRule(makeDiamond({ fluorescence: 'NONE' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ fluorescence: 'none' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ fluorescence: 'FAINT' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ fluorescence: 'STRONG' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ fluorescence: undefined }))).toBeUndefined();
    });
  });

  describe('certificateLab filter', () => {
    it('should match by certificate lab', () => {
      engine.setRules([makeRule({ id: '1', rating: 9, certificateLabs: ['GIA', 'AGS'] })]);

      expect(engine.findMatchingRule(makeDiamond({ certificateLab: 'GIA' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ certificateLab: 'gia' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ certificateLab: 'AGS' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ certificateLab: 'IGI' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ certificateLab: undefined }))).toBeUndefined();
    });
  });

  describe('labGrown filter', () => {
    it('should match lab-grown = true', () => {
      engine.setRules([makeRule({ id: '1', rating: 7, labGrown: true })]);

      expect(engine.findMatchingRule(makeDiamond({ labGrown: true }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ labGrown: false }))).toBeUndefined();
    });

    it('should match lab-grown = false (natural only)', () => {
      engine.setRules([makeRule({ id: '1', rating: 9, labGrown: false })]);

      expect(engine.findMatchingRule(makeDiamond({ labGrown: false }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ labGrown: true }))).toBeUndefined();
    });

    it('should match any if labGrown not set on rule', () => {
      engine.setRules([makeRule({ id: '1', rating: 5 })]);

      expect(engine.findMatchingRule(makeDiamond({ labGrown: true }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ labGrown: false }))?.id).toBe('1');
    });
  });

  describe('carat range filter', () => {
    it('should match by carat range', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, caratMin: 1.0, caratMax: 3.0 })]);

      expect(engine.findMatchingRule(makeDiamond({ carats: 0.99 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ carats: 1.0 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ carats: 2.0 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ carats: 3.0 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ carats: 3.01 }))).toBeUndefined();
    });

    it('should reject if diamond has no carat value but rule requires it', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, caratMin: 1.0 })]);
      expect(engine.findMatchingRule(makeDiamond({ carats: undefined }))).toBeUndefined();
    });
  });

  // --- Tier 2: Measurement filters ---

  describe('table percentage filter', () => {
    it('should match by table % range', () => {
      engine.setRules([makeRule({ id: '1', rating: 7, tableMin: 54, tableMax: 62 })]);

      expect(engine.findMatchingRule(makeDiamond({ tablePct: 53.9 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ tablePct: 54 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ tablePct: 58 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ tablePct: 62 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ tablePct: 62.1 }))).toBeUndefined();
    });
  });

  describe('depth percentage filter', () => {
    it('should match by depth % range', () => {
      engine.setRules([makeRule({ id: '1', rating: 7, depthMin: 59, depthMax: 63 })]);

      expect(engine.findMatchingRule(makeDiamond({ depthPct: 58.9 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ depthPct: 61 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ depthPct: 63.1 }))).toBeUndefined();
    });
  });

  describe('crown angle filter', () => {
    it('should match by crown angle range', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, crownAngleMin: 33, crownAngleMax: 36 })]);

      expect(engine.findMatchingRule(makeDiamond({ crownAngle: 32.9 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ crownAngle: 34.5 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ crownAngle: 36.1 }))).toBeUndefined();
    });
  });

  describe('crown height filter', () => {
    it('should match by crown height range', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, crownHeightMin: 14, crownHeightMax: 16.5 })]);

      expect(engine.findMatchingRule(makeDiamond({ crownHeight: 13.9 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ crownHeight: 15 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ crownHeight: 16.6 }))).toBeUndefined();
    });
  });

  describe('pavilion angle filter', () => {
    it('should match by pavilion angle range', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, pavilionAngleMin: 40, pavilionAngleMax: 42 })]);

      expect(engine.findMatchingRule(makeDiamond({ pavilionAngle: 39.9 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ pavilionAngle: 41 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ pavilionAngle: 42.1 }))).toBeUndefined();
    });
  });

  describe('pavilion depth filter', () => {
    it('should match by pavilion depth range', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, pavilionDepthMin: 42, pavilionDepthMax: 44 })]);

      expect(engine.findMatchingRule(makeDiamond({ pavilionDepth: 41.9 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ pavilionDepth: 43 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ pavilionDepth: 44.1 }))).toBeUndefined();
    });
  });

  describe('ratio filter', () => {
    it('should match by L/W ratio range', () => {
      engine.setRules([makeRule({ id: '1', rating: 7, ratioMin: 1.0, ratioMax: 1.05 })]);

      expect(engine.findMatchingRule(makeDiamond({ ratio: 0.99 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ ratio: 1.02 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ ratio: 1.06 }))).toBeUndefined();
    });
  });

  describe('girdle filter', () => {
    it('should match by girdle values', () => {
      engine.setRules([makeRule({ id: '1', rating: 7, girdles: ['THIN', 'MEDIUM'] })]);

      expect(engine.findMatchingRule(makeDiamond({ girdle: 'THIN' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ girdle: 'medium' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ girdle: 'THICK' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ girdle: undefined }))).toBeUndefined();
    });
  });

  describe('culet size filter', () => {
    it('should match by culet size values', () => {
      engine.setRules([makeRule({ id: '1', rating: 8, culetSizes: ['NONE', 'VERY SMALL'] })]);

      expect(engine.findMatchingRule(makeDiamond({ culetSize: 'NONE' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ culetSize: 'VERY SMALL' }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ culetSize: 'LARGE' }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ culetSize: undefined }))).toBeUndefined();
    });
  });

  // --- Combined tests ---

  describe('combined extended filters', () => {
    it('should match rule with all tiers combined', () => {
      engine.setRules([
        makeRule({
          id: '1',
          rating: 10,
          shapes: ['ROUND'],
          colors: ['D'],
          clarities: ['IF'],
          cuts: ['EXCELLENT'],
          polishes: ['EXCELLENT'],
          symmetries: ['EXCELLENT'],
          fluorescences: ['NONE'],
          certificateLabs: ['GIA'],
          labGrown: false,
          caratMin: 1,
          caratMax: 3,
          tableMin: 54,
          tableMax: 62,
          depthMin: 59,
          depthMax: 63,
          crownAngleMin: 33,
          crownAngleMax: 36,
          ratioMin: 1.0,
          ratioMax: 1.05,
          girdles: ['THIN', 'MEDIUM'],
          culetSizes: ['NONE'],
          feed: 'nivoda',
        }),
      ]);

      const perfect = makeDiamond({
        feedPrice: 5000,
        shape: 'ROUND',
        color: 'D',
        clarity: 'IF',
        cut: 'EX',
        polish: 'EX',
        symmetry: 'EX',
        fluorescence: 'NONE',
        certificateLab: 'GIA',
        labGrown: false,
        carats: 2.0,
        tablePct: 58,
        depthPct: 61,
        crownAngle: 34.5,
        ratio: 1.02,
        girdle: 'MEDIUM',
        culetSize: 'NONE',
        feed: 'nivoda',
      });

      expect(engine.findMatchingRule(perfect)?.id).toBe('1');
      expect(engine.findMatchingRule(perfect)?.rating).toBe(10);

      // Fail on each extended filter
      expect(engine.findMatchingRule({ ...perfect, polish: 'GOOD' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, symmetry: 'GOOD' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, fluorescence: 'STRONG' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, certificateLab: 'IGI' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, labGrown: true } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, carats: 0.5 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, tablePct: 50 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, depthPct: 65 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, crownAngle: 30 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, ratio: 1.1 } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, girdle: 'THICK' } as any)).toBeUndefined();
      expect(engine.findMatchingRule({ ...perfect, culetSize: 'LARGE' } as any)).toBeUndefined();
    });

    it('should use priority to pick correct rule with overlapping extended filters', () => {
      engine.setRules([
        makeRule({ id: 'gia-premium', priority: 10, rating: 9, certificateLabs: ['GIA'], polishes: ['EXCELLENT'] }),
        makeRule({ id: 'any-gia', priority: 20, rating: 7, certificateLabs: ['GIA'] }),
        makeRule({ id: 'fallback', priority: 100, rating: 5 }),
      ]);

      expect(engine.findMatchingRule(makeDiamond({ certificateLab: 'GIA', polish: 'EX' }))?.id).toBe('gia-premium');
      expect(engine.findMatchingRule(makeDiamond({ certificateLab: 'GIA', polish: 'GOOD' }))?.id).toBe('any-gia');
      expect(engine.findMatchingRule(makeDiamond({ certificateLab: 'IGI' }))?.id).toBe('fallback');
    });
  });

  describe('calculateRating', () => {
    it('should return undefined if no rule matches', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, priceMin: 10000 })]);
      expect(engine.calculateRating(makeDiamond({ feedPrice: 100 }))).toBeUndefined();
    });

    it('should return rating from matching rule', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, priceMin: 1000 })]);
      expect(engine.calculateRating(makeDiamond({ feedPrice: 2000 }))).toBe(5);
    });

    it('should return rating from highest priority matching rule', () => {
      engine.setRules([
        makeRule({ id: '1', priority: 10, rating: 3 }),
        makeRule({ id: '2', priority: 5, rating: 5 }),
      ]);
      expect(engine.calculateRating(makeDiamond())).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle empty rules array', () => {
      engine.setRules([]);
      expect(engine.findMatchingRule(makeDiamond())).toBeUndefined();
    });

    it('should handle rules with empty filter arrays', () => {
      engine.setRules([
        makeRule({
          id: '1',
          rating: 5,
          shapes: [],
          colors: [],
          clarities: [],
          cuts: [],
          polishes: [],
          symmetries: [],
          fluorescences: [],
          girdles: [],
          culetSizes: [],
          certificateLabs: [],
        }),
      ]);
      expect(engine.findMatchingRule(makeDiamond())?.id).toBe('1');
    });

    it('should handle diamond with all undefined attributes', () => {
      engine.setRules([makeRule({ id: '1', rating: 5 })]);
      const result = engine.findMatchingRule({
        feedPrice: 100,
        shape: undefined,
        color: undefined,
        clarity: undefined,
        cut: undefined,
        feed: 'nivoda',
        labGrown: false,
        carats: undefined,
        polish: undefined,
        symmetry: undefined,
        fluorescence: undefined,
        certificateLab: undefined,
        tablePct: undefined,
        depthPct: undefined,
        crownAngle: undefined,
        crownHeight: undefined,
        pavilionAngle: undefined,
        pavilionDepth: undefined,
        girdle: undefined,
        culetSize: undefined,
        ratio: undefined,
      });
      expect(result?.id).toBe('1');
    });

    it('should handle zero price', () => {
      engine.setRules([makeRule({ id: '1', rating: 5, priceMin: 0, priceMax: 100 })]);
      expect(engine.findMatchingRule(makeDiamond({ feedPrice: 0 }))?.id).toBe('1');
    });

    it('should not mutate original rules array', () => {
      const originalRules: RatingRule[] = [
        makeRule({ id: '3', priority: 30, rating: 3 }),
        makeRule({ id: '1', priority: 10, rating: 1 }),
      ];
      engine.setRules(originalRules);
      expect(originalRules[0].id).toBe('3');
      expect(originalRules[1].id).toBe('1');
    });

    it('should handle min-only range filters', () => {
      engine.setRules([makeRule({ id: '1', rating: 7, caratMin: 2.0 })]);
      expect(engine.findMatchingRule(makeDiamond({ carats: 1.99 }))).toBeUndefined();
      expect(engine.findMatchingRule(makeDiamond({ carats: 2.0 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ carats: 100 }))?.id).toBe('1');
    });

    it('should handle max-only range filters', () => {
      engine.setRules([makeRule({ id: '1', rating: 7, caratMax: 1.0 })]);
      expect(engine.findMatchingRule(makeDiamond({ carats: 0.5 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ carats: 1.0 }))?.id).toBe('1');
      expect(engine.findMatchingRule(makeDiamond({ carats: 1.01 }))).toBeUndefined();
    });
  });
});
