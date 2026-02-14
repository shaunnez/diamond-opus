/**
 * Integration tests for API endpoints.
 * These tests use supertest to make HTTP requests to the Express app
 * and verify the API contracts without requiring real external services.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { sha256 } from '@diamond/shared';

// Mock database module
vi.mock('@diamond/database', () => ({
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
  searchDiamonds: vi.fn(),
  getDiamondById: vi.fn(),
  updateDiamondAvailability: vi.fn().mockResolvedValue(undefined),
  createHoldHistory: vi.fn().mockResolvedValue(undefined),
  createPurchaseHistory: vi.fn(),
  getPurchaseByIdempotencyKey: vi.fn(),
  updatePurchaseStatus: vi.fn().mockResolvedValue(undefined),
}));

// Mock Nivoda adapter
vi.mock('@diamond/nivoda', () => ({
  NivodaAdapter: vi.fn().mockImplementation(() => ({
    createHold: vi.fn(),
    createOrder: vi.fn(),
  })),
}));

import { createApp } from '../src/server.js';

const {
  getApiKeyByHash,
  searchDiamonds,
  getDiamondById,
  getPurchaseByIdempotencyKey,
} = await import('@diamond/database');

const mockGetApiKeyByHash = vi.mocked(getApiKeyByHash);
const mockSearchDiamonds = vi.mocked(searchDiamonds);
const mockGetDiamondById = vi.mocked(getDiamondById);
const mockGetPurchaseByIdempotencyKey = vi.mocked(getPurchaseByIdempotencyKey);

describe('API Routes', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();

    // Set up default HMAC secrets
    process.env['HMAC_SECRETS'] = JSON.stringify({
      'test-client': 'test-secret',
    });

    // Default: valid API key
    mockGetApiKeyByHash.mockResolvedValue({
      id: 'key-1',
      keyHash: sha256('test-api-key'),
      clientName: 'test',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
    });
  });

  afterEach(() => {
    delete process.env['HMAC_SECRETS'];
  });

  describe('GET /health', () => {
    it('should return health status without authentication', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/v2/diamonds', () => {
    it('should return 401 without authentication', async () => {
      mockGetApiKeyByHash.mockResolvedValue(null);

      const response = await request(app).get('/api/v2/diamonds');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return paginated diamonds with valid API key', async () => {
      const mockDiamonds = [
        {
          id: 'diamond-1',
          supplier: 'nivoda',
          supplierStoneId: 'stone-1',
          offerId: 'offer-1',
          shape: 'ROUND',
          carats: 1.5,
          color: 'G',
          clarity: 'VS1',
          cut: 'Excellent',
          polish: 'Excellent',
          symmetry: 'Excellent',
          fluorescence: 'None',
          labGrown: false,
          treated: false,
          supplierPriceCents: 500000,
          pricePerCaratCents: 333333,
          priceModelPriceCents: 575000,
          markupRatio: 1.15,
          rating: 5,
          availability: 'available',
          rawAvailability: 'AVAILABLE',
          holdId: null,
          imageUrl: null,
          videoUrl: null,
          certificateLab: 'GIA',
          certificateNumber: 'GIA123',
          certificatePdfUrl: null,
          // Denormalized measurement fields
          tablePct: null,
          depthPct: null,
          lengthMm: null,
          widthMm: null,
          depthMm: null,
          crownAngle: null,
          crownHeight: null,
          pavilionAngle: null,
          pavilionDepth: null,
          girdle: null,
          culetSize: null,
          // Denormalized attribute fields
          eyeClean: null,
          brown: null,
          green: null,
          milky: null,
          supplierName: 'Test Supplier',
          supplierLegalName: null,
          status: 'active',
          sourceUpdatedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      mockSearchDiamonds.mockResolvedValue({
        data: mockDiamonds,
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
      });

      const response = await request(app)
        .get('/api/v2/diamonds')
        .set('X-API-Key', 'test-api-key');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.pagination.total).toBe(1);
    });

    it('should pass query filters to database', async () => {
      mockSearchDiamonds.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
      });

      await request(app)
        .get('/api/v2/diamonds')
        .query({
          shape: 'OVAL',
          carat_min: 1.0,
          carat_max: 2.0,
          color: 'G',
          lab_grown: 'true',
        })
        .set('X-API-Key', 'test-api-key');

      expect(mockSearchDiamonds).toHaveBeenCalledWith(
        expect.objectContaining({
          shape: 'OVAL',
          caratMin: 1,
          caratMax: 2,
          colors: ['G'],
          labGrown: true,
        })
      );
    });

    it('should handle array query parameters', async () => {
      mockSearchDiamonds.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
      });

      await request(app)
        .get('/api/v2/diamonds')
        .query({
          color: ['G', 'H', 'I'],
          clarity: ['VS1', 'VS2'],
        })
        .set('X-API-Key', 'test-api-key');

      expect(mockSearchDiamonds).toHaveBeenCalledWith(
        expect.objectContaining({
          colors: ['G', 'H', 'I'],
          clarities: ['VS1', 'VS2'],
        })
      );
    });
  });

  describe('GET /api/v2/diamonds/:id', () => {
    it('should return diamond by ID', async () => {
      const mockDiamond = {
        id: 'diamond-1',
        supplier: 'nivoda',
        supplierStoneId: 'stone-1',
        offerId: 'offer-1',
        shape: 'ROUND',
        carats: 1.5,
        color: 'G',
        clarity: 'VS1',
        cut: 'Excellent',
        polish: 'Excellent',
        symmetry: 'Excellent',
        fluorescence: 'None',
        labGrown: false,
        treated: false,
        supplierPriceCents: 500000,
        pricePerCaratCents: 333333,
        priceModelPriceCents: null,
        markupRatio: null,
        rating: null,
        availability: 'available',
        rawAvailability: null,
        holdId: null,
        imageUrl: null,
        videoUrl: null,
        certificateLab: 'GIA',
        certificateNumber: 'GIA123',
        certificatePdfUrl: null,
        // Denormalized measurement fields
        tablePct: null,
        depthPct: null,
        lengthMm: null,
        widthMm: null,
        depthMm: null,
        crownAngle: null,
        crownHeight: null,
        pavilionAngle: null,
        pavilionDepth: null,
        girdle: null,
        culetSize: null,
        // Denormalized attribute fields
        eyeClean: null,
        brown: null,
        green: null,
        milky: null,
        supplierName: null,
        supplierLegalName: null,
        status: 'active',
        sourceUpdatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockGetDiamondById.mockResolvedValue(mockDiamond);

      const response = await request(app)
        .get('/api/v2/diamonds/550e8400-e29b-41d4-a716-446655440000')
        .set('X-API-Key', 'test-api-key');

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('diamond-1');
    });

    it('should return 404 for non-existent diamond', async () => {
      mockGetDiamondById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v2/diamonds/550e8400-e29b-41d4-a716-446655440000')
        .set('X-API-Key', 'test-api-key');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should validate UUID format', async () => {
      const response = await request(app)
        .get('/api/v2/diamonds/invalid-id')
        .set('X-API-Key', 'test-api-key');

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v2/diamonds/:id/availability', () => {
    it('should return availability status', async () => {
      const mockDiamond = {
        id: 'diamond-1',
        supplier: 'nivoda',
        supplierStoneId: 'stone-1',
        offerId: 'offer-1',
        shape: 'ROUND',
        carats: 1.5,
        color: 'G',
        clarity: 'VS1',
        cut: 'Excellent',
        polish: 'Excellent',
        symmetry: 'Excellent',
        fluorescence: 'None',
        labGrown: false,
        treated: false,
        supplierPriceCents: 500000,
        pricePerCaratCents: 333333,
        priceModelPriceCents: null,
        markupRatio: null,
        rating: null,
        availability: 'on_hold',
        rawAvailability: null,
        holdId: 'hold-123',
        imageUrl: null,
        videoUrl: null,
        certificateLab: null,
        certificateNumber: null,
        certificatePdfUrl: null,
        measurements: null,
        attributes: null,
        supplierName: null,
        supplierLegalName: null,
        status: 'active',
        sourceUpdatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockGetDiamondById.mockResolvedValue(mockDiamond);

      const response = await request(app)
        .post('/api/v2/diamonds/550e8400-e29b-41d4-a716-446655440000/availability')
        .set('X-API-Key', 'test-api-key');

      expect(response.status).toBe(200);
      expect(response.body.data.availability).toBe('on_hold');
      expect(response.body.data.hold_id).toBe('hold-123');
    });
  });

  describe('POST /api/v2/diamonds/:id/purchase', () => {
    const mockDiamond = {
      id: 'diamond-1',
      supplier: 'nivoda',
      supplierStoneId: 'stone-1',
      offerId: 'offer-1',
      shape: 'ROUND',
      carats: 1.5,
      color: 'G',
      clarity: 'VS1',
      cut: 'Excellent',
      polish: 'Excellent',
      symmetry: 'Excellent',
      fluorescence: 'None',
      labGrown: false,
      treated: false,
      supplierPriceCents: 500000,
      pricePerCaratCents: 333333,
      priceModelPriceCents: null,
      markupRatio: null,
      rating: null,
      availability: 'available',
      rawAvailability: null,
      holdId: null,
      imageUrl: null,
      videoUrl: null,
      certificateLab: null,
      certificateNumber: null,
      certificatePdfUrl: null,
      // Denormalized measurement fields
      tablePct: null,
      depthPct: null,
      lengthMm: null,
      widthMm: null,
      depthMm: null,
      crownAngle: null,
      crownHeight: null,
      pavilionAngle: null,
      pavilionDepth: null,
      girdle: null,
      culetSize: null,
      // Denormalized attribute fields
      eyeClean: null,
      brown: null,
      green: null,
      milky: null,
      supplierName: null,
      supplierLegalName: null,
      status: 'active',
      sourceUpdatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    it('should require idempotency key', async () => {
      const response = await request(app)
        .post('/api/v2/diamonds/550e8400-e29b-41d4-a716-446655440000/purchase')
        .set('X-API-Key', 'test-api-key')
        .send({ destination_id: 'dest-1' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Idempotency');
    });

    it('should return existing purchase for duplicate idempotency key', async () => {
      mockGetPurchaseByIdempotencyKey.mockResolvedValue({
        id: 'purchase-1',
        diamondId: 'diamond-1',
        feed: 'nivoda',
        feedOfferId: 'offer-1',
        idempotencyKey: 'idempotency-123',
        status: 'confirmed',
        feedOrderId: 'order-123',
        reference: null,
        comments: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app)
        .post('/api/v2/diamonds/550e8400-e29b-41d4-a716-446655440000/purchase')
        .set('X-API-Key', 'test-api-key')
        .set('X-Idempotency-Key', 'idempotency-123')
        .send({ destination_id: 'dest-1' });

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe('order-123');
      expect(response.body.data.status).toBe('confirmed');
    });

    it('should reject purchase of already sold diamond', async () => {
      mockGetPurchaseByIdempotencyKey.mockResolvedValue(null);
      mockGetDiamondById.mockResolvedValue({
        ...mockDiamond,
        availability: 'sold',
      });

      const response = await request(app)
        .post('/api/v2/diamonds/550e8400-e29b-41d4-a716-446655440000/purchase')
        .set('X-API-Key', 'test-api-key')
        .set('X-Idempotency-Key', 'idempotency-456')
        .send({ destination_id: 'dest-1' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should require destination_id in body', async () => {
      mockGetPurchaseByIdempotencyKey.mockResolvedValue(null);
      mockGetDiamondById.mockResolvedValue(mockDiamond);

      const response = await request(app)
        .post('/api/v2/diamonds/550e8400-e29b-41d4-a716-446655440000/purchase')
        .set('X-API-Key', 'test-api-key')
        .set('X-Idempotency-Key', 'idempotency-789')
        .send({});

      expect(response.status).toBe(400);
    });
  });
});
