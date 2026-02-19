import type { Diamond } from "@diamond/shared";
import type { NivodaItem } from "./types.js";

function mapAvailability(nivodaAvailability: string): Diamond["availability"] {
  const normalizedAvailability = nivodaAvailability?.toLowerCase() ?? "";

  if (normalizedAvailability.includes("available")) {
    return "available";
  }
  if (normalizedAvailability.includes("hold")) {
    return "on_hold";
  }
  if (normalizedAvailability.includes("sold")) {
    return "sold";
  }
  return "unavailable";
}

function mapFluorescence(floInt?: string, floCol?: string): string | undefined {
  if (!floInt) return undefined;
  return floCol ? `${floInt} ${floCol}` : floInt;
}

function parseFluorescenceIntensity(floInt?: string): string | undefined {
  if (!floInt) return undefined;
  const normalized = floInt.toUpperCase().replace(/[\s-]+/g, "_");
  const mapping: Record<string, string> = {
    NONE: "NONE",
    NON: "NONE",
    FAINT: "FAINT",
    FNT: "FAINT",
    MEDIUM: "MEDIUM",
    MED: "MEDIUM",
    STRONG: "STRONG",
    STG: "STRONG",
    VERY_STRONG: "VERY_STRONG",
    VST: "VERY_STRONG",
  };
  return mapping[normalized] ?? normalized;
}

function computeRatio(length?: number, width?: number): number | undefined {
  if (!length || !width || width === 0) return undefined;
  return Math.round((length / width) * 1000) / 1000;
}

function normalizeFancyColor(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const upper = trimmed.toUpperCase();
  // Invalid / noise values from Nivoda
  if (upper === 'EVEN' || upper === 'U-V') return undefined;

  // Synonyms
  if (upper === 'GREY') return 'Gray';

  // Compound colors with space → hyphenated Title Case.
  // Reversed pairs (e.g. "ORANGE BROWN" / "BROWN ORANGE") are normalised to
  // the alphabetically-first canonical form so the database and filter chips
  // never hold duplicate entries for the same colour.
  const compoundMap: Record<string, string> = {
    // Genuinely distinct grades (modifier + dominant differ in meaning)
    'GREEN YELLOW': 'Green-Yellow',
    'YELLOW GREEN': 'Yellow-Green',
    'ORANGE YELLOW': 'Orange-Yellow',
    'YELLOW ORANGE': 'Yellow-Orange',
    'GRAY BLUE': 'Gray-Blue',
    // Canonical form (alphabetically first) + reversed alias → same value
    'BROWN ORANGE': 'Brown-Orange',
    'ORANGE BROWN': 'Brown-Orange',
    'BROWN PINK': 'Brown-Pink',
    'PINK BROWN': 'Brown-Pink',
    'BROWN YELLOW': 'Brown-Yellow',
    'YELLOW BROWN': 'Brown-Yellow',
    'PINK PURPLE': 'Pink-Purple',
    'PURPLE PINK': 'Pink-Purple',
  };
  if (compoundMap[upper]) return compoundMap[upper];

  // Adjective forms (keep space, Title Case)
  const adjectiveMap: Record<string, string> = {
    'ORANGY BROWN': 'Orangy Brown',
    'ORANGY YELLOW': 'Orangy Yellow',
  };
  if (adjectiveMap[upper]) return adjectiveMap[upper];

  // General Title Case (handles hyphenated already e.g. "BROWN-PINK" → "Brown-Pink")
  return trimmed
    .split(/([- ])/)
    .map((part) => (part === '-' || part === ' ' ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join('');
}

function normalizeFancyIntensity(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // All separator variants (space, underscore, dash) map to the same
  // Title-Case-with-spaces canonical string that the storefront filter uses.
  const intensityMap: Record<string, string> = {
    'FAINT': 'Faint',
    'VERY LIGHT': 'Very Light',
    'VERY_LIGHT': 'Very Light',
    'VERY-LIGHT': 'Very Light',
    'LIGHT': 'Light',
    'FANCY LIGHT': 'Fancy Light',
    'FANCY_LIGHT': 'Fancy Light',
    'FANCY-LIGHT': 'Fancy Light',
    'FANCY': 'Fancy',
    'FANCY INTENSE': 'Fancy Intense',
    'FANCY_INTENSE': 'Fancy Intense',
    'FANCY-INTENSE': 'Fancy Intense',
    'FANCY VIVID': 'Fancy Vivid',
    'FANCY_VIVID': 'Fancy Vivid',
    'FANCY-VIVID': 'Fancy Vivid',
    'FANCY DEEP': 'Fancy Deep',
    'FANCY_DEEP': 'Fancy Deep',
    'FANCY-DEEP': 'Fancy Deep',
    'FANCY DARK': 'Fancy Dark',
    'FANCY_DARK': 'Fancy Dark',
    'FANCY-DARK': 'Fancy Dark',
  };

  const upper = trimmed.toUpperCase();
  return intensityMap[upper] ?? (trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase());
}

function parseEyeClean(value: unknown): boolean | null | undefined | null {
  if (value == null) return null;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return false;

  if (["true", "yes", "1", "t", "y"].includes(normalized)) return true;
  if (["false", "no", "0", "f", "n", "none", "n/a"].includes(normalized)) return false;

  return null;
}

export function mapNivodaItemToDiamond(
  item: NivodaItem,
): Omit<
  Diamond,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "priceModelPrice"
  | "markupRatio"
  | "rating"
> {
  const { diamond } = item;
  const { certificate } = diamond;

  if (!certificate) {
    throw new Error(`Diamond ${diamond.id}: missing certificate`);
  }
  const resolvedImage = diamond.image ?? diamond.certificate.image;
  if (!resolvedImage) {
    throw new Error(`Diamond ${diamond.id}: missing image`);
  }
  // ?.replace('/500/500', '/')
  const resolvedVideo = diamond.video ?? diamond.certificate.v360?.url ?? diamond.supplier_video_link;
  if (!resolvedVideo) {
    throw new Error(`Diamond ${diamond.id}: missing video`);
  }

  const feedPrice = item.price / 100;
  const diamondPrice = item.diamond_price != null ? item.diamond_price / 100 : undefined;
  const carats = certificate.carats ?? undefined;
  const pricePerCarat = carats ? feedPrice / carats : 0;

  return {
    feed: "nivoda",
    supplierStoneId: diamond.id,
    offerId: item.id,
    shape: certificate.shape,
    carats,
    color: certificate.color ?? undefined,
    clarity: certificate.clarity ?? undefined,
    cut: certificate.cut ?? undefined,
    polish: certificate.polish ?? undefined,
    symmetry: certificate.symmetry ?? undefined,
    fluorescence: mapFluorescence(certificate.floInt, certificate.floCol),
    fluorescenceIntensity: parseFluorescenceIntensity(certificate.floInt),
    fancyColor: normalizeFancyColor(certificate.f_color ?? undefined),
    fancyIntensity: normalizeFancyIntensity(certificate.f_intensity ?? undefined),
    fancyOvertone: normalizeFancyColor(certificate.f_overtone ?? undefined),
    ratio: computeRatio(certificate.length, certificate.width),
    labGrown: certificate.labgrown ?? Boolean(certificate.labgrown_type),
    treated: certificate.treated ?? false,
    feedPrice,
    diamondPrice,
    pricePerCarat,
    availability: mapAvailability(diamond.availability),
    rawAvailability: diamond.availability,
    holdId: diamond.HoldId ?? undefined,
    imageUrl: resolvedImage,
    videoUrl: resolvedVideo,
    metaImages: (certificate.product_images ?? [])
      .map(img => ({ id: img.id, url: img.url, displayIndex: img.display_index ?? 0 }))
      .sort((a, b) => a.displayIndex - b.displayIndex),
    certificateLab: certificate.lab,
    certificateNumber: certificate.certNumber,
    certificatePdfUrl: certificate.pdfUrl ?? undefined,
    tablePct: certificate.table,
    depthPct: certificate.depthPercentage,
    lengthMm: certificate.length,
    widthMm: certificate.width,
    depthMm: certificate.depth,
    crownAngle: certificate.crownAngle,
    crownHeight: certificate.crownHeight,
    pavilionAngle: certificate.pavAngle,
    pavilionDepth: certificate.pavDepth,
    girdle: certificate.girdle,
    culetSize: certificate.culetSize,
    eyeClean: parseEyeClean(diamond.eyeClean),
    brown: diamond.brown,
    green: diamond.green,
    milky: diamond.milky,
    supplierName: diamond.supplier?.name,
    supplierLegalName: diamond.supplier?.legal_name,
    status: "active",
    sourceUpdatedAt: undefined,
    deletedAt: undefined,
  };
}

export function mapRawPayloadToDiamond(
  payload: Record<string, unknown>,
): Omit<
  Diamond,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "priceModelPrice"
  | "markupRatio"
  | "rating"
> {
  return mapNivodaItemToDiamond(payload as unknown as NivodaItem);
}