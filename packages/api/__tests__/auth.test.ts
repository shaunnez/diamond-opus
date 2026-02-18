import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { sha256 } from '@diamond/shared';

vi.mock('@diamond/database', () => ({
  getApiKeyByHash: vi.fn(),
  updateApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}));

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
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
    };
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };
    mockNext = vi.fn();
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
