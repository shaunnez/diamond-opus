import type {
  Diamond,
} from "@diamond/shared";
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

function mapFancyColor(certificate: NivodaItem["diamond"]["certificate"]): string | undefined {
  const parts: string[] = [];
  if (certificate.f_intensity) parts.push(certificate.f_intensity);
  if (certificate.f_color) parts.push(certificate.f_color);
  if (certificate.f_overtone) parts.push(certificate.f_overtone);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function parseFluorescenceIntensity(floInt?: string): string | undefined {
  if (!floInt) return undefined;
  const normalized = floInt.toUpperCase().replace(/[\s-]+/g, '_');
  const mapping: Record<string, string> = {
    NONE: 'NONE',
    NON: 'NONE',
    FAINT: 'FAINT',
    FNT: 'FAINT',
    MEDIUM: 'MEDIUM',
    MED: 'MEDIUM',
    STRONG: 'STRONG',
    STG: 'STRONG',
    VERY_STRONG: 'VERY_STRONG',
    VST: 'VERY_STRONG',
  };
  return mapping[normalized] ?? normalized;
}

function computeRatio(length?: number, width?: number): number | undefined {
  if (!length || !width || width === 0) return undefined;
  return Math.round((length / width) * 1000) / 1000;
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

  const feedPrice = item.price / 100; // Nivoda returns cents, store as dollars
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
    fancyColor: certificate.f_color ?? undefined,
    fancyIntensity: certificate.f_intensity ?? undefined,
    fancyOvertone: certificate.f_overtone ?? undefined,
    ratio: computeRatio(certificate.length, certificate.width),
    labGrown: certificate.labgrown ?? false,
    treated: certificate.treated ?? false,
    //fancyColor: mapFancyColor(certificate),
    feedPrice,
    diamondPrice,
    pricePerCarat,
    availability: mapAvailability(diamond.availability),
    rawAvailability: diamond.availability,
    holdId: diamond.HoldId ?? undefined,
    imageUrl: diamond.image ?? undefined,
    videoUrl: diamond.video ?? diamond.supplier_video_link ?? undefined,
    certificateLab: certificate.lab,
    certificateNumber: certificate.certNumber,
    certificatePdfUrl: certificate.pdfUrl ?? undefined,
    // Denormalized measurement fields
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
    // Denormalized attribute fields
    eyeClean: diamond.eyeClean,
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
