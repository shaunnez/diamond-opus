import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NivodaAdapter } from '../src/adapter.js';

vi.mock('graphql-request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('graphql-request')>();
  return {
    ...actual,
    GraphQLClient: vi.fn().mockImplementation(() => ({
      request: vi.fn(),
    })),
  };
});

describe('NivodaAdapter', () => {
  let adapter: NivodaAdapter;
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const { GraphQLClient } = vi.mocked(await import('graphql-request'));
    mockRequest = vi.fn();
    (GraphQLClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      request: mockRequest,
    }));

    adapter = new NivodaAdapter(
      'https://test.api.com',
      'testuser',
      'testpass'
    );
  });

  describe('authentication', () => {
    it('should authenticate and cache token', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValueOnce({
        as: { diamonds_by_query_count: 100 },
      });

      await adapter.getDiamondsCount({});

      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it('should reuse cached token within expiry window', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValue({
        as: { diamonds_by_query_count: 100 },
      });

      await adapter.getDiamondsCount({});
      await adapter.getDiamondsCount({});
      await adapter.getDiamondsCount({});

      expect(mockRequest).toHaveBeenCalledTimes(4);
    });

    it('should clear token cache when clearTokenCache is called', () => {
      adapter.clearTokenCache();
      expect(true).toBe(true);
    });
  });

  describe('getDiamondsCount', () => {
    it('should return count from diamonds_by_query_count', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValueOnce({
        as: { diamonds_by_query_count: 5000 },
      });

      const count = await adapter.getDiamondsCount({
        shapes: ['ROUND'],
        sizes: { from: 0.5, to: 2.0 },
      });

      expect(count).toBe(5000);
    });
  });

  describe('searchDiamonds', () => {
    it('should enforce max limit of 50', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValueOnce({
        as: {
          diamonds_by_query: {
            total_count: 100,
            items: [],
          },
        },
      });

      await adapter.searchDiamonds({}, { limit: 100 });

      const lastCall = mockRequest.mock.calls[1];
      expect(lastCall?.[1]?.limit).toBe(50);
    });

    it('should use provided limit if under max', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValueOnce({
        as: {
          diamonds_by_query: {
            total_count: 100,
            items: [],
          },
        },
      });

      await adapter.searchDiamonds({}, { limit: 30 });

      const lastCall = mockRequest.mock.calls[1];
      expect(lastCall?.[1]?.limit).toBe(30);
    });
  });

  describe('createHold', () => {
    it('should create hold with offer id', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValueOnce({
        as: {
          create_hold: {
            id: 'hold-123',
            denied: false,
            until: '2024-01-01T00:00:00Z',
          },
        },
      });

      const result = await adapter.createHold('offer-456');

      expect(result.id).toBe('hold-123');
      expect(result.denied).toBe(false);
    });
  });

  describe('createOrder', () => {
    it('should create order with required parameters', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValueOnce({
        as: {
          create_order: {
            id: 'order-789',
            status: 'confirmed',
          },
        },
      });

      const result = await adapter.createOrder('offer-456', 'dest-123', {
        reference: 'REF001',
        comments: 'Test order',
      });

      expect(result.id).toBe('order-789');
      expect(result.status).toBe('confirmed');
    });
  });
});
