import type { RatingRule, Diamond } from '@diamond/shared';
import { getActiveRatingRules } from '@diamond/database';

/**
 * Normalises a cut short-code to the long-form value stored in rating rules.
 * Diamonds from Nivoda store "EX", "VG", "G", etc., while the dashboard saves
 * rules with "EXCELLENT", "VERY GOOD", "GOOD", etc.
 */
function normaliseCut(cut: string): string {
  const c = cut.toUpperCase();
  if (c === 'EX') return 'EXCELLENT';
  if (c === 'VG') return 'VERY GOOD';
  if (c === 'G') return 'GOOD';
  if (c === 'F') return 'FAIR';
  if (c === 'P') return 'POOR';
  if (c === 'ID') return 'IDEAL';
  return c;
}

export class RatingEngine {
  private rules: RatingRule[] = [];
  private rulesLoaded = false;

  async loadRules(): Promise<void> {
    this.rules = await getActiveRatingRules();
    this.rulesLoaded = true;
  }

  setRules(rules: RatingRule[]): void {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
    this.rulesLoaded = true;
  }

  private matchesRule(
    rule: RatingRule,
    diamond: Pick<Diamond, 'feedPrice' | 'shape' | 'color' | 'clarity' | 'cut' | 'feed'>
  ): boolean {
    if (rule.priceMin !== undefined && diamond.feedPrice < rule.priceMin) {
      return false;
    }

    if (rule.priceMax !== undefined && diamond.feedPrice > rule.priceMax) {
      return false;
    }

    if (rule.shapes && rule.shapes.length > 0) {
      if (!diamond.shape || !rule.shapes.includes(diamond.shape.toUpperCase())) {
        return false;
      }
    }

    if (rule.colors && rule.colors.length > 0) {
      if (!diamond.color || !rule.colors.includes(diamond.color.toUpperCase())) {
        return false;
      }
    }

    if (rule.clarities && rule.clarities.length > 0) {
      if (!diamond.clarity || !rule.clarities.includes(diamond.clarity.toUpperCase())) {
        return false;
      }
    }

    if (rule.cuts && rule.cuts.length > 0) {
      if (!diamond.cut || !rule.cuts.map(c => c.toUpperCase()).includes(normaliseCut(diamond.cut))) {
        return false;
      }
    }

    if (rule.feed !== undefined && rule.feed !== diamond.feed) {
      return false;
    }

    return true;
  }

  findMatchingRule(
    diamond: Pick<Diamond, 'feedPrice' | 'shape' | 'color' | 'clarity' | 'cut' | 'feed'>
  ): RatingRule | undefined {
    if (!this.rulesLoaded) {
      throw new Error('Rating rules not loaded. Call loadRules() first.');
    }

    for (const rule of this.rules) {
      if (this.matchesRule(rule, diamond)) {
        return rule;
      }
    }

    return undefined;
  }

  calculateRating(
    diamond: Pick<Diamond, 'feedPrice' | 'shape' | 'color' | 'clarity' | 'cut' | 'feed'>
  ): number | undefined {
    const matchedRule = this.findMatchingRule(diamond);
    return matchedRule?.rating;
  }
}

let defaultEngine: RatingEngine | null = null;

export async function getDefaultRatingEngine(): Promise<RatingEngine> {
  if (!defaultEngine) {
    defaultEngine = new RatingEngine();
    await defaultEngine.loadRules();
  }
  return defaultEngine;
}

export function resetDefaultRatingEngine(): void {
  defaultEngine = null;
}
