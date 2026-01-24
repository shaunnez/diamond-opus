import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { sha256, hmacSha256 } from '@diamond/shared';

vi.mock('@diamond/database', () => ({
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}));

describe('Auth Middleware', () => {
  let mockReq: Partial<Request> & { rawBody?: string };
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });

    mockReq = {
      headers: {},
      method: 'GET',
      path: '/api/v2/diamonds',
      rawBody: '',
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = vi.fn();

    process.env['HMAC_SECRETS'] = JSON.stringify({
      'test-client': 'test-secret',
    });
  });

  describe('API Key Authentication', () => {
    it('should pass with valid API key', async () => {
      const { getApiKeyByHash } = await import('@diamond/database');
      (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'key-1',
        keyHash: sha256('valid-api-key'),
        clientName: 'test',
        active: true,
      });

      mockReq.headers = { 'x-api-key': 'valid-api-key' };

      const { authMiddleware } = await import('../src/middleware/auth.js');
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      const { getApiKeyByHash } = await import('@diamond/database');
      (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      mockReq.headers = { 'x-api-key': 'invalid-api-key' };

      const { authMiddleware } = await import('../src/middleware/auth.js');
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('HMAC Authentication', () => {
    it('should pass with valid HMAC signature', async () => {
      const { getApiKeyByHash } = await import('@diamond/database');
      (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = sha256('');
      const canonicalString = ['GET', '/api/v2/diamonds', timestamp, bodyHash].join('\n');
      const signature = hmacSha256('test-secret', canonicalString);

      mockReq.headers = {
        'x-client-id': 'test-client',
        'x-timestamp': timestamp,
        'x-signature': signature,
      };
      mockReq.rawBody = '';

      const { authMiddleware } = await import('../src/middleware/auth.js');
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject expired timestamp', async () => {
      const { getApiKeyByHash } = await import('@diamond/database');
      (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const timestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const bodyHash = sha256('');
      const canonicalString = ['GET', '/api/v2/diamonds', timestamp, bodyHash].join('\n');
      const signature = hmacSha256('test-secret', canonicalString);

      mockReq.headers = {
        'x-client-id': 'test-client',
        'x-timestamp': timestamp,
        'x-signature': signature,
      };

      const { authMiddleware } = await import('../src/middleware/auth.js');
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject tampered body', async () => {
      const { getApiKeyByHash } = await import('@diamond/database');
      (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const timestamp = Math.floor(Date.now() / 1000).toString();
      const bodyHash = sha256('original-body');
      const canonicalString = ['POST', '/api/v2/diamonds', timestamp, bodyHash].join('\n');
      const signature = hmacSha256('test-secret', canonicalString);

      mockReq.method = 'POST';
      mockReq.headers = {
        'x-client-id': 'test-client',
        'x-timestamp': timestamp,
        'x-signature': signature,
      };
      mockReq.rawBody = 'tampered-body';

      const { authMiddleware } = await import('../src/middleware/auth.js');
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });

    it('should reject unknown client', async () => {
      const { getApiKeyByHash } = await import('@diamond/database');
      (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const timestamp = Math.floor(Date.now() / 1000).toString();

      mockReq.headers = {
        'x-client-id': 'unknown-client',
        'x-timestamp': timestamp,
        'x-signature': 'some-signature',
      };

      const { authMiddleware } = await import('../src/middleware/auth.js');
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('No Authentication', () => {
    it('should reject requests with no auth headers', async () => {
      const { getApiKeyByHash } = await import('@diamond/database');
      (getApiKeyByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      mockReq.headers = {};

      const { authMiddleware } = await import('../src/middleware/auth.js');
      await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });
});
