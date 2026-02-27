import type { RatingRule, Diamond } from '@diamond/shared';
import { getActiveRatingRules } from '@diamond/database';

/**
 * Fields on a Diamond used for rating rule evaluation.
 */
type RatingDiamond = Pick<
  Diamond,
  | 'feedPrice'
  | 'shape'
  | 'color'
  | 'clarity'
  | 'cut'
  | 'feed'
  | 'carats'
  | 'polish'
  | 'symmetry'
  | 'fluorescence'
  | 'certificateLab'
  | 'labGrown'
  | 'tablePct'
  | 'depthPct'
  | 'crownAngle'
  | 'crownHeight'
  | 'pavilionAngle'
  | 'pavilionDepth'
  | 'girdle'
  | 'culetSize'
  | 'ratio'
>;

/**
 * Normalises a grading short-code to the long-form value stored in rating rules.
 * Used for cut, polish, and symmetry grades.
 * E.g. "EX" → "EXCELLENT", "VG" → "VERY GOOD".
 */
function normaliseGrade(grade: string): string {
  const g = grade.toUpperCase();
  if (g === 'EX') return 'EXCELLENT';
  if (g === 'VG') return 'VERY GOOD';
  if (g === 'G') return 'GOOD';
  if (g === 'F') return 'FAIR';
  if (g === 'P') return 'POOR';
  if (g === 'ID') return 'IDEAL';
  return g;
}

/**
 * Returns false (no match) if the diamond value falls outside [min, max].
 * Returns true if the value is within range or the filter is not set.
 */
function matchesRange(
  value: number | undefined | null,
  min: number | undefined,
  max: number | undefined
): boolean {
  if (min === undefined && max === undefined) return true;
  if (value === undefined || value === null) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

/**
 * Returns false (no match) if the diamond value is not in the allowed list.
 * Returns true if the value matches or the filter is not set.
 * When `normalise` is true, applies grade normalisation (EX→EXCELLENT etc.).
 */
function matchesTextArray(
  value: string | undefined | null,
  allowed: string[] | undefined,
  normalise: boolean = false
): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!value) return false;
  const normValue = normalise ? normaliseGrade(value) : value.toUpperCase();
  return allowed.some(a => (normalise ? normaliseGrade(a) : a.toUpperCase()) === normValue);
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

  private matchesRule(rule: RatingRule, diamond: RatingDiamond): boolean {
    // Price range
    if (!matchesRange(diamond.feedPrice, rule.priceMin, rule.priceMax)) return false;

    // Basic 4Cs (text array filters)
    if (!matchesTextArray(diamond.shape, rule.shapes)) return false;
    if (!matchesTextArray(diamond.color, rule.colors)) return false;
    if (!matchesTextArray(diamond.clarity, rule.clarities)) return false;
    if (!matchesTextArray(diamond.cut, rule.cuts, true)) return false;

    // Feed
    if (rule.feed !== undefined && rule.feed !== diamond.feed) return false;

    // Tier 1: Grading
    if (!matchesTextArray(diamond.polish, rule.polishes, true)) return false;
    if (!matchesTextArray(diamond.symmetry, rule.symmetries, true)) return false;
    if (!matchesTextArray(diamond.fluorescence, rule.fluorescences)) return false;
    if (!matchesTextArray(diamond.certificateLab, rule.certificateLabs)) return false;

    // Tier 1: Lab-grown boolean
    if (rule.labGrown !== undefined) {
      if (diamond.labGrown !== rule.labGrown) return false;
    }

    // Tier 1: Carat range
    if (!matchesRange(diamond.carats, rule.caratMin, rule.caratMax)) return false;

    // Tier 2: Measurements
    if (!matchesRange(diamond.tablePct, rule.tableMin, rule.tableMax)) return false;
    if (!matchesRange(diamond.depthPct, rule.depthMin, rule.depthMax)) return false;
    if (!matchesRange(diamond.crownAngle, rule.crownAngleMin, rule.crownAngleMax)) return false;
    if (!matchesRange(diamond.crownHeight, rule.crownHeightMin, rule.crownHeightMax)) return false;
    if (!matchesRange(diamond.pavilionAngle, rule.pavilionAngleMin, rule.pavilionAngleMax)) return false;
    if (!matchesRange(diamond.pavilionDepth, rule.pavilionDepthMin, rule.pavilionDepthMax)) return false;
    if (!matchesRange(diamond.ratio, rule.ratioMin, rule.ratioMax)) return false;

    // Tier 2: Girdle & Culet (text arrays)
    if (!matchesTextArray(diamond.girdle, rule.girdles)) return false;
    if (!matchesTextArray(diamond.culetSize, rule.culetSizes)) return false;

    return true;
  }

  findMatchingRule(diamond: RatingDiamond): RatingRule | undefined {
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

  calculateRating(diamond: RatingDiamond): number | undefined {
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
