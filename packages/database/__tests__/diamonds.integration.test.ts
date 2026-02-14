/**
 * Integration tests for diamond database queries.
 * These tests mock the database client to verify query construction
 * and result mapping without requiring a real database connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the client module before importing the queries
vi.mock('../src/client.js', () => ({
  query: vi.fn(),
}));

import { query } from '../src/client.js';
import {
  searchDiamonds,
  getDiamondById,
  updateDiamondAvailability,
  softDeleteDiamond,
} from '../src/queries/diamonds.js';

const mockQuery = vi.mocked(query);

describe('Diamond Database Queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchDiamonds', () => {
    it('should return paginated results with default parameters', async () => {
      const mockRows = [
        {
          id: 'diamond-1',
          feed: 'nivoda',
          supplier_stone_id: 'stone-1',
          offer_id: 'offer-1',
          shape: 'ROUND',
          carats: '1.0',
          color: 'G',
          clarity: 'VS1',
          cut: 'Excellent',
          polish: 'Excellent',
          symmetry: 'Excellent',
          fluorescence: 'None',
          lab_grown: false,
          treated: false,
          feed_price: '5000.00',
          price_per_carat: '5000.00',
          price_model_price: '5750.00',
          markup_ratio: '1.15',
          rating: 5,
          availability: 'available',
          raw_availability: 'AVAILABLE',
          hold_id: null,
          image_url: 'https://example.com/image.jpg',
          video_url: null,
          certificate_lab: 'GIA',
          certificate_number: 'GIA123',
          certificate_pdf_url: null,
          // Denormalized measurement fields
          table_pct: null,
          depth_pct: null,
          length_mm: null,
          width_mm: null,
          depth_mm: null,
          crown_angle: null,
          crown_height: null,
          pavilion_angle: null,
          pavilion_depth: null,
          girdle: null,
          culet_size: null,
          // Denormalized attribute fields
          eye_clean: null,
          brown: null,
          green: null,
          milky: null,
          supplier_name: 'Test Supplier',
          supplier_legal_name: null,
          status: 'active',
          source_updated_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
        },
      ];

      // Mock count query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      // Mock data query
      mockQuery.mockResolvedValueOnce({ rows: mockRows });

      const result = await searchDiamonds({ page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('diamond-1');
      expect(result.data[0].carats).toBe(1.0);
      expect(result.data[0].feedPrice).toBe(5000);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(50);
    });

    it('should apply shapes filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await searchDiamonds({ shapes: ['OVAL'] });

      // First call is count query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('shape = ANY($'),
        expect.arrayContaining([['OVAL']])
      );
    });

    it('should apply carat range filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await searchDiamonds({ caratMin: 1.0, caratMax: 2.0 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('carats >= $'),
        expect.arrayContaining([1.0])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('carats <= $'),
        expect.arrayContaining([2.0])
      );
    });

    it('should apply lab grown filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await searchDiamonds({ labGrown: true });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('lab_grown = $'),
        expect.arrayContaining([true])
      );
    });

    it('should limit results to maximum of 100', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await searchDiamonds({ limit: 500 });

      // Second call is data query with limit
      expect(mockQuery.mock.calls[1][1]).toContain(100);
    });
  });

  describe('getDiamondById', () => {
    it('should return diamond when found', async () => {
      const mockRow = {
        id: 'diamond-1',
        feed: 'nivoda',
        supplier_stone_id: 'stone-1',
        offer_id: 'offer-1',
        shape: 'ROUND',
        carats: '1.5',
        color: 'F',
        clarity: 'VVS1',
        cut: 'Excellent',
        polish: 'Excellent',
        symmetry: 'Excellent',
        fluorescence: 'None',
        lab_grown: false,
        treated: false,
        feed_price: '7500.00',
        price_per_carat: '5000.00',
        price_model_price: null,
        markup_ratio: null,
        rating: null,
        availability: 'available',
        raw_availability: null,
        hold_id: null,
        image_url: null,
        video_url: null,
        certificate_lab: null,
        certificate_number: null,
        certificate_pdf_url: null,
        // Denormalized measurement fields
        table_pct: null,
        depth_pct: null,
        length_mm: null,
        width_mm: null,
        depth_mm: null,
        crown_angle: null,
        crown_height: null,
        pavilion_angle: null,
        pavilion_depth: null,
        girdle: null,
        culet_size: null,
        // Denormalized attribute fields
        eye_clean: null,
        brown: null,
        green: null,
        milky: null,
        supplier_name: null,
        supplier_legal_name: null,
        status: 'active',
        source_updated_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await getDiamondById('diamond-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('diamond-1');
      expect(result!.carats).toBe(1.5);
      expect(result!.feedPrice).toBe(7500);
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getDiamondById('nonexistent');

      expect(result).toBeNull();
    });

    it('should only query active diamonds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getDiamondById('diamond-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'active'"),
        ['diamond-1']
      );
    });
  });

  describe('updateDiamondAvailability', () => {
    it('should update availability with hold id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateDiamondAvailability('diamond-1', 'on_hold', 'hold-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE diamonds SET availability'),
        ['on_hold', 'hold-123', 'diamond-1']
      );
    });

    it('should update availability without hold id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await updateDiamondAvailability('diamond-1', 'available');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE diamonds SET availability'),
        ['available', undefined, 'diamond-1']
      );
    });
  });

  describe('softDeleteDiamond', () => {
    it('should set status to deleted and deleted_at timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await softDeleteDiamond('diamond-1');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("status = 'deleted'"),
        ['diamond-1']
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = NOW()'),
        expect.any(Array)
      );
    });
  });
});
