import type { Diamond } from '@diamond/shared';
import type { DemoFeedItem } from './types.js';

/**
 * Maps demo feed availability status to canonical availability.
 */
function mapAvailability(status: string): Diamond['availability'] {
  switch (status?.toLowerCase()) {
    case 'available':
      return 'available';
    case 'on_hold':
    case 'hold':
      return 'on_hold';
    case 'sold':
      return 'sold';
    default:
      return 'unavailable';
  }
}

/**
 * Maps a raw demo feed item to canonical Diamond format.
 * This demonstrates how different field names get normalized.
 */
export function mapDemoItemToDiamond(
  item: DemoFeedItem,
): Omit<
  Diamond,
  'id' | 'createdAt' | 'updatedAt' | 'retailPrice' | 'markupRatio' | 'rating'
> {
  return {
    feed: 'demo',
    supplierStoneId: item.stone_id,
    offerId: item.id,
    shape: item.stone_shape,
    carats: item.weight_ct,
    color: item.stone_color,
    clarity: item.stone_clarity,
    cut: item.cut_grade ?? undefined,
    polish: item.polish_grade ?? undefined,
    symmetry: item.symmetry_grade ?? undefined,
    fluorescence: item.fluorescence_level ?? undefined,
    labGrown: item.is_lab_created,
    treated: item.is_treated,
    priceModelPrice: item.asking_price_usd,
    pricePerCarat: item.price_per_ct_usd,
    availability: mapAvailability(item.availability_status),
    rawAvailability: item.availability_status,
    imageUrl: item.image_link ?? undefined,
    videoUrl: item.video_link ?? undefined,
    certificateLab: item.cert_lab ?? undefined,
    certificateNumber: item.cert_number ?? undefined,
    supplierName: item.vendor_name ?? undefined,
    status: 'active',
    sourceUpdatedAt: item.updated_at ? new Date(item.updated_at) : undefined,
    deletedAt: undefined,
  };
}

/**
 * Maps a raw payload (from the raw_diamonds_demo table) to canonical Diamond.
 * The payload is the full demo feed item as stored during ingestion.
 */
export function mapRawPayloadToDiamond(
  payload: Record<string, unknown>,
): Omit<
  Diamond,
  'id' | 'createdAt' | 'updatedAt' | 'retailPrice' | 'markupRatio' | 'rating'
> {
  return mapDemoItemToDiamond(payload as unknown as DemoFeedItem);
}
