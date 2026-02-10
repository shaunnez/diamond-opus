import type { PricingRule, PricingResult, Diamond, StoneType } from '@diamond/shared';
import { NATURAL_BASE_MARGIN, LAB_BASE_MARGIN, FANCY_BASE_MARGIN } from '@diamond/shared';
import { getActivePricingRules } from '@diamond/database';

const DEFAULT_MARGIN_MODIFIER = 0;

/**
 * Determines the stone type for a diamond.
 * Priority: fancy (has fancyColor) > lab (labGrown) > natural
 */
export function getStoneType(
  diamond: Pick<Diamond, 'labGrown' | 'fancyColor'>
): StoneType {
  if (diamond.fancyColor) return 'fancy';
  if (diamond.labGrown) return 'lab';
  return 'natural';
}

/**
 * Returns the base margin percentage for a stone type.
 */
export function getBaseMargin(stoneType: StoneType): number {
  switch (stoneType) {
    case 'lab':
      return LAB_BASE_MARGIN;
    case 'fancy':
      return FANCY_BASE_MARGIN;
    case 'natural':
    default:
      return NATURAL_BASE_MARGIN;
  }
}

export class PricingEngine {
  private rules: PricingRule[] = [];
  private rulesLoaded = false;

  async loadRules(): Promise<void> {
    this.rules = await getActivePricingRules();
    this.rulesLoaded = true;
  }

  setRules(rules: PricingRule[]): void {
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
    this.rulesLoaded = true;
  }

  private matchesRule(
    rule: PricingRule,
    diamond: Pick<Diamond, 'feedPrice' | 'labGrown' | 'fancyColor' | 'feed'>,
    stoneType: StoneType
  ): boolean {
    if (rule.stoneType !== undefined && rule.stoneType !== stoneType) {
      return false;
    }

    if (rule.priceMin !== undefined && diamond.feedPrice < rule.priceMin) {
      return false;
    }

    if (rule.priceMax !== undefined && diamond.feedPrice > rule.priceMax) {
      return false;
    }

    if (rule.feed !== undefined && rule.feed !== diamond.feed) {
      return false;
    }

    return true;
  }

  findMatchingRule(
    diamond: Pick<Diamond, 'feedPrice' | 'labGrown' | 'fancyColor' | 'feed'>
  ): PricingRule | undefined {
    if (!this.rulesLoaded) {
      throw new Error('Pricing rules not loaded. Call loadRules() first.');
    }

    const stoneType = getStoneType(diamond);

    for (const rule of this.rules) {
      if (this.matchesRule(rule, diamond, stoneType)) {
        return rule;
      }
    }

    return undefined;
  }

  calculatePricing(
    diamond: Pick<Diamond, 'carats' | 'feedPrice' | 'labGrown' | 'fancyColor' | 'feed'>
  ): PricingResult {
    const stoneType = getStoneType(diamond);
    const baseMargin = getBaseMargin(stoneType);
    const matchedRule = this.findMatchingRule(diamond);

    const marginModifier = matchedRule?.marginModifier ?? DEFAULT_MARGIN_MODIFIER;
    const effectiveMargin = baseMargin + marginModifier;
    const markupRatio = 1 + effectiveMargin / 100;
    const rating = matchedRule?.rating;

    const priceModelPrice = Math.round(diamond.feedPrice * markupRatio * 100) / 100;
    const pricePerCarat = diamond.carats ? Math.round((diamond.feedPrice / diamond.carats) * 100) / 100 : 0;

    return {
      feedPrice: diamond.feedPrice,
      priceModelPrice,
      pricePerCarat,
      markupRatio,
      rating,
      matchedRuleId: matchedRule?.id,
      stoneType,
      baseMargin,
      marginModifier,
      effectiveMargin,
    };
  }

  applyPricing(
    diamond: Omit<Diamond, 'id' | 'createdAt' | 'updatedAt' | 'priceModelPrice' | 'markupRatio' | 'rating'>
  ): Omit<Diamond, 'id' | 'createdAt' | 'updatedAt'> {
    const pricing = this.calculatePricing(diamond);

    return {
      ...diamond,
      priceModelPrice: pricing.priceModelPrice,
      markupRatio: pricing.markupRatio,
      rating: pricing.rating,
      pricePerCarat: pricing.pricePerCarat,
    };
  }
}

let defaultEngine: PricingEngine | null = null;

export async function getDefaultPricingEngine(): Promise<PricingEngine> {
  if (!defaultEngine) {
    defaultEngine = new PricingEngine();
    await defaultEngine.loadRules();
  }
  return defaultEngine;
}

export function resetDefaultPricingEngine(): void {
  defaultEngine = null;
}
