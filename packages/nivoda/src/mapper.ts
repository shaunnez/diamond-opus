import type {
  Diamond,
  DiamondMeasurements,
  DiamondAttributes,
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

function mapMeasurements(
  certificate: NivodaItem["diamond"]["certificate"],
): DiamondMeasurements | undefined {
  const measurements: DiamondMeasurements = {};
  let hasValue = false;

  if (certificate.length !== undefined) {
    measurements.length = certificate.length;
    hasValue = true;
  }
  if (certificate.width !== undefined) {
    measurements.width = certificate.width;
    hasValue = true;
  }
  if (certificate.depth !== undefined) {
    measurements.depth = certificate.depth;
    hasValue = true;
  }
  if (certificate.depthPercentage !== undefined) {
    measurements.depthPercentage = certificate.depthPercentage;
    hasValue = true;
  }
  if (certificate.table !== undefined) {
    measurements.table = certificate.table;
    hasValue = true;
  }
  if (certificate.crownAngle !== undefined) {
    measurements.crownAngle = certificate.crownAngle;
    hasValue = true;
  }
  if (certificate.crownHeight !== undefined) {
    measurements.crownHeight = certificate.crownHeight;
    hasValue = true;
  }
  if (certificate.pavAngle !== undefined) {
    measurements.pavAngle = certificate.pavAngle;
    hasValue = true;
  }
  if (certificate.pavHeight !== undefined) {
    measurements.pavHeight = certificate.pavHeight;
    hasValue = true;
  }
  if (certificate.pavDepth !== undefined) {
    measurements.pavDepth = certificate.pavDepth;
    hasValue = true;
  }
  if (certificate.girdle !== undefined) {
    measurements.girdle = certificate.girdle;
    hasValue = true;
  }
  if (certificate.culetSize !== undefined) {
    measurements.culetSize = certificate.culetSize;
    hasValue = true;
  }
  if (certificate.girdleCondition !== undefined) {
    measurements.girdleCondition = certificate.girdleCondition;
    hasValue = true;
  }
  if (certificate.culet_condition !== undefined) {
    measurements.culetCondition = certificate.culet_condition;
    hasValue = true;
  }

  return hasValue ? measurements : undefined;
}

function mapAttributes(
  diamond: NivodaItem["diamond"],
): DiamondAttributes | undefined {
  const attributes: DiamondAttributes = {};
  let hasValue = false;

  if (diamond.eyeClean !== undefined) {
    attributes.eyeClean = diamond.eyeClean;
    hasValue = true;
  }
  if (diamond.brown !== undefined) {
    attributes.brown = diamond.brown;
    hasValue = true;
  }
  if (diamond.green !== undefined) {
    attributes.green = diamond.green;
    hasValue = true;
  }
  if (diamond.blue !== undefined) {
    attributes.blue = diamond.blue;
    hasValue = true;
  }
  if (diamond.gray !== undefined) {
    attributes.gray = diamond.gray;
    hasValue = true;
  }
  if (diamond.milky !== undefined) {
    attributes.milky = diamond.milky;
    hasValue = true;
  }
  if (diamond.bowtie !== undefined) {
    attributes.bowtie = diamond.bowtie;
    hasValue = true;
  }
  if (diamond.mine_of_origin !== undefined) {
    attributes.mineOfOrigin = diamond.mine_of_origin;
    hasValue = true;
  }
  if (diamond.certificate.cut_style !== undefined) {
    attributes.cutStyle = diamond.certificate.cut_style;
    hasValue = true;
  }
  if (diamond.certificate.keyToSymbols !== undefined) {
    attributes.keyToSymbols = diamond.certificate.keyToSymbols;
    hasValue = true;
  }
  if (diamond.certificate.comments !== undefined) {
    attributes.comments = diamond.certificate.comments;
    hasValue = true;
  }

  return hasValue ? attributes : undefined;
}

function mapFluorescence(floInt?: string, floCol?: string): string | undefined {
  if (!floInt) return undefined;
  return floCol ? `${floInt} ${floCol}` : floInt;
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

  const feedPrice = item.price;
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
    labGrown: certificate.labgrown ?? false,
    treated: certificate.treated ?? false,
    feedPrice,
    pricePerCarat,
    availability: mapAvailability(diamond.availability),
    rawAvailability: diamond.availability,
    holdId: diamond.HoldId ?? undefined,
    imageUrl: diamond.image ?? undefined,
    videoUrl: diamond.video ?? diamond.supplier_video_link ?? undefined,
    certificateLab: certificate.lab,
    certificateNumber: certificate.certNumber,
    certificatePdfUrl: certificate.pdfUrl ?? undefined,
    measurements: mapMeasurements(certificate),
    attributes: mapAttributes(diamond),
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
