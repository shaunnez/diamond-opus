import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProxyGraphqlTransport } from '../src/proxyTransport.js';

describe('ProxyGraphqlTransport', () => {
  let transport: ProxyGraphqlTransport;
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    transport = new ProxyGraphqlTransport(
      'https://api-test.example.com',
      'test-token',
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('should construct endpoint from base URL', () => {
    const t = new ProxyGraphqlTransport('https://api.example.com/', 'tok');
    // Verify via a request that the URL is correct
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: {} }),
    });

    t.request('query { test }', {});

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v2/internal/nivoda/graphql',
      expect.anything(),
    );
  });

  it('should make successful request with correct headers', async () => {
    const mockResponse = { data: { test: 'value' } };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockResponse),
    });

    const result = await transport.request('query { test }', { foo: 'bar' });

    expect(result).toEqual(mockResponse.data);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api-test.example.com/api/v2/internal/nivoda/graphql',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': 'test-token',
        },
        body: JSON.stringify({ query: 'query { test }', variables: { foo: 'bar' } }),
      }),
    );
  });

  it('should throw on non-ok response with parsed error message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => JSON.stringify({
        error: { code: 'BAD_GATEWAY', message: 'Failed to reach Nivoda' },
      }),
    });

    await expect(
      transport.request('query { test }', {}),
    ).rejects.toThrow('Nivoda proxy error 502: Failed to reach Nivoda');
  });

  it('should throw on non-ok response with raw text when not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    await expect(
      transport.request('query { test }', {}),
    ).rejects.toThrow('Nivoda proxy error 500: Internal Server Error');
  });

  it('should attach statusCode and query to error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { message: 'Forbidden' } }),
    });

    try {
      await transport.request('query { longQueryHere }', {});
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.statusCode).toBe(403);
      expect(error.query).toBe('query { longQueryHere }');
    }
  });

  it('should handle timeout', async () => {
    // Use a very short timeout for testing
    const shortTimeoutTransport = new ProxyGraphqlTransport(
      'https://api-test.example.com',
      'test-token',
      50, // 50ms timeout
    );

    mockFetch.mockImplementation((_url: any, init: any) => {
      return new Promise((resolve, reject) => {
        // Listen for abort signal
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
        // Never resolve - simulates hung connection
      });
    });

    await expect(
      shortTimeoutTransport.request('query { test }', {}),
    ).rejects.toThrow('Nivoda proxy request timeout after 50ms');
  });

  it('should propagate network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      transport.request('query { test }', {}),
    ).rejects.toThrow('Network error');
  });
});
