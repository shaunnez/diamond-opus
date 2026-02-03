import { describe, it, expect } from 'vitest';
import { mapNivodaItemToDiamond } from '../src/mapper.js';
import type { NivodaItem } from '../src/types.js';

const createMockItem = (overrides: Partial<NivodaItem> = {}): NivodaItem => ({
  id: 'offer-123',
  price: 1500.50,
  discount: 10,
  diamond_price: 1400,
  markup_price: 100.50,
  markup_discount: 5,
  diamond: {
    id: 'diamond-456',
    availability: 'Available',
    NivodaStockId: 'NIVODA-789',
    supplierStockId: 'SUPPLIER-001',
    image: 'https://example.com/image.jpg',
    video: 'https://example.com/video.mp4',
    eyeClean: true,
    certificate: {
      id: 'cert-111',
      lab: 'GIA',
      certNumber: 'GIA123456',
      pdfUrl: 'https://example.com/cert.pdf',
      shape: 'ROUND',
      carats: 1.5,
      clarity: 'VS1',
      cut: 'Excellent',
      polish: 'Excellent',
      symmetry: 'Excellent',
      color: 'D',
      floInt: 'None',
      labgrown: false,
      treated: false,
    },
    supplier: {
      id: 'supplier-1',
      name: 'Test Supplier',
      legal_name: 'Test Supplier LLC',
    },
    ...overrides.diamond,
  },
  ...overrides,
});

describe('mapNivodaItemToDiamond', () => {
  it('should map basic diamond properties correctly', () => {
    const item = createMockItem();
    const result = mapNivodaItemToDiamond(item);

    expect(result.feed).toBe('nivoda');
    expect(result.supplierStoneId).toBe('diamond-456');
    expect(result.offerId).toBe('offer-123');
    expect(result.shape).toBe('ROUND');
    expect(result.carats).toBe(1.5);
    expect(result.color).toBe('D');
    expect(result.clarity).toBe('VS1');
  });

  it('should calculate prices correctly', () => {
    const item = createMockItem();
    const result = mapNivodaItemToDiamond(item);

    expect(result.priceModelPrice).toBe(1500.50);
    expect(result.pricePerCarat).toBe(1500.50 / 1.5);
  });

  it('should map availability statuses correctly', () => {
    const availableItem = createMockItem({ diamond: { ...createMockItem().diamond, availability: 'Available' } });
    expect(mapNivodaItemToDiamond(availableItem).availability).toBe('available');

    const holdItem = createMockItem({ diamond: { ...createMockItem().diamond, availability: 'On Hold' } });
    expect(mapNivodaItemToDiamond(holdItem).availability).toBe('on_hold');

    const soldItem = createMockItem({ diamond: { ...createMockItem().diamond, availability: 'Sold' } });
    expect(mapNivodaItemToDiamond(soldItem).availability).toBe('sold');

    const unknownItem = createMockItem({ diamond: { ...createMockItem().diamond, availability: 'Unknown' } });
    expect(mapNivodaItemToDiamond(unknownItem).availability).toBe('unavailable');
  });

  it('should preserve offer_id for ordering and supplier_stone_id for tracking', () => {
    const item = createMockItem();
    const result = mapNivodaItemToDiamond(item);

    expect(result.offerId).toBe('offer-123');
    expect(result.supplierStoneId).toBe('diamond-456');
  });

  it('should handle missing optional fields', () => {
    const item = createMockItem({
      diamond: {
        id: 'diamond-456',
        availability: 'Available',
        NivodaStockId: 'NIVODA-789',
        certificate: {
          id: 'cert-111',
          lab: 'GIA',
          certNumber: 'GIA123456',
          shape: 'ROUND',
          carats: 1.0,
          clarity: 'VS1',
          color: 'D',
        },
      },
    });

    const result = mapNivodaItemToDiamond(item);

    expect(result.cut).toBeUndefined();
    expect(result.polish).toBeUndefined();
    expect(result.symmetry).toBeUndefined();
    expect(result.imageUrl).toBeUndefined();
    expect(result.videoUrl).toBeUndefined();
    expect(result.supplierName).toBeUndefined();
  });

  it('should map lab-grown diamonds correctly', () => {
    const item = createMockItem({
      diamond: {
        ...createMockItem().diamond,
        certificate: {
          ...createMockItem().diamond.certificate,
          labgrown: true,
          labgrown_type: 'CVD',
        },
      },
    });

    const result = mapNivodaItemToDiamond(item);
    expect(result.labGrown).toBe(true);
  });

  it('should map fluorescence with color', () => {
    const item = createMockItem({
      diamond: {
        ...createMockItem().diamond,
        certificate: {
          ...createMockItem().diamond.certificate,
          floInt: 'Strong',
          floCol: 'Blue',
        },
      },
    });

    const result = mapNivodaItemToDiamond(item);
    expect(result.fluorescence).toBe('Strong Blue');
  });

  it('should set status to active', () => {
    const item = createMockItem();
    const result = mapNivodaItemToDiamond(item);
    expect(result.status).toBe('active');
  });
});
