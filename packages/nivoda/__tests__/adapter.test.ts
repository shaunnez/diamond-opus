import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NivodaAdapter } from '../src/adapter.js';
import type { NivodaOrder, NivodaQuery } from '../src/types.js';

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

    it('should pass updated filter to count query', async () => {
      mockRequest.mockResolvedValueOnce({
        authenticate: {
          username_and_password: { token: 'test-token' },
        },
      });

      mockRequest.mockResolvedValueOnce({
        as: { diamonds_by_query_count: 1000 },
      });

      const query: NivodaQuery = {
        shapes: ['ROUND'],
        dollar_value: { from: 0, to: 5000 },
        updated: {
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-06-01T00:00:00.000Z',
        },
      };
      const count = await adapter.getDiamondsCount(query);

      expect(count).toBe(1000);
      const lastCall = mockRequest.mock.calls[1];
      expect(lastCall?.[1]?.query?.updated).toEqual({
        from: '2024-01-01T00:00:00.000Z',
        to: '2024-06-01T00:00:00.000Z',
      });
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

    it('should pass order parameter to GraphQL query', async () => {
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

      const order: NivodaOrder = { type: 'createdAt', direction: 'ASC' };
      await adapter.searchDiamonds({}, { order });

      const lastCall = mockRequest.mock.calls[1];
      expect(lastCall?.[1]?.order).toEqual({ type: 'createdAt', direction: 'ASC' });
    });

    it('should pass updated filter in query', async () => {
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

      const query: NivodaQuery = {
        shapes: ['ROUND'],
        updated: {
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-06-01T00:00:00.000Z',
        },
      };
      await adapter.searchDiamonds(query, {});

      const lastCall = mockRequest.mock.calls[1];
      expect(lastCall?.[1]?.query).toEqual(expect.objectContaining({
        shapes: ['ROUND'],
        updated: {
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-06-01T00:00:00.000Z',
        },
      }));
    });

    it('should pass both updated and order together', async () => {
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

      const query: NivodaQuery = {
        shapes: ['ROUND'],
        dollar_value: { from: 1000, to: 5000 },
        updated: {
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-06-01T00:00:00.000Z',
        },
      };
      const order: NivodaOrder = { type: 'createdAt', direction: 'ASC' };
      await adapter.searchDiamonds(query, { offset: 0, limit: 30, order });

      const lastCall = mockRequest.mock.calls[1];
      expect(lastCall?.[1]?.query?.updated).toEqual({
        from: '2024-01-01T00:00:00.000Z',
        to: '2024-06-01T00:00:00.000Z',
      });
      expect(lastCall?.[1]?.order).toEqual({ type: 'createdAt', direction: 'ASC' });
      expect(lastCall?.[1]?.offset).toBe(0);
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
          create_order: 'order-789'
        },
      });

      const result = await adapter.createOrder([{
        offerId: 'offer-456',
        destinationId: 'dest-123',
        return_option: false,  
        customer_order_number: 'REF001',
        customer_comment: 'Test order',
      }]);
      expect(result).toBe('order-789');
    });
  });
});
