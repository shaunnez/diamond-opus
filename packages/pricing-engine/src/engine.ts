import type { PricingRule, PricingResult, Diamond } from '@diamond/shared';
import { getActivePricingRules } from '@diamond/database';

const DEFAULT_MARKUP_RATIO = 1.15;

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
    diamond: Pick<Diamond, 'carats' | 'shape' | 'labGrown' | 'feed'>
  ): boolean {
    if (rule.caratMin !== undefined && diamond.carats < rule.caratMin) {
      return false;
    }

    if (rule.caratMax !== undefined && diamond.carats > rule.caratMax) {
      return false;
    }

    if (rule.shapes !== undefined && rule.shapes.length > 0) {
      if (!rule.shapes.includes(diamond.shape)) {
        return false;
      }
    }

    if (rule.labGrown !== undefined && rule.labGrown !== diamond.labGrown) {
      return false;
    }

    if (rule.feed !== undefined && rule.feed !== diamond.feed) {
      return false;
    }

    return true;
  }

  findMatchingRule(
    diamond: Pick<Diamond, 'carats' | 'shape' | 'labGrown' | 'feed'>
  ): PricingRule | undefined {
    if (!this.rulesLoaded) {
      throw new Error('Pricing rules not loaded. Call loadRules() first.');
    }

    for (const rule of this.rules) {
      if (this.matchesRule(rule, diamond)) {
        return rule;
      }
    }

    return undefined;
  }

  calculatePricing(
    diamond: Pick<Diamond, 'carats' | 'shape' | 'labGrown' | 'feed' | 'priceModelPrice'>
  ): PricingResult {
    const matchedRule = this.findMatchingRule(diamond);

    const markupRatio = matchedRule?.markupRatio ?? DEFAULT_MARKUP_RATIO;
    const rating = matchedRule?.rating;

    const retailPrice = Math.round(diamond.priceModelPrice * markupRatio * 100) / 100;
    const pricePerCarat = Math.round((diamond.priceModelPrice / diamond.carats) * 100) / 100;

    return {
      priceModelPrice: diamond.priceModelPrice,
      retailPrice,
      pricePerCarat,
      markupRatio,
      rating,
      matchedRuleId: matchedRule?.id,
    };
  }

  applyPricing(
    diamond: Omit<Diamond, 'id' | 'createdAt' | 'updatedAt' | 'retailPrice' | 'markupRatio' | 'rating'>
  ): Omit<Diamond, 'id' | 'createdAt' | 'updatedAt'> {
    const pricing = this.calculatePricing(diamond);

    return {
      ...diamond,
      retailPrice: pricing.retailPrice,
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
