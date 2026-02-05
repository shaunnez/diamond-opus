import { GraphQLClient, ClientError } from 'graphql-request';
import {
  requireEnv,
  TOKEN_LIFETIME_MS,
  TOKEN_EXPIRY_BUFFER_MS,
  NIVODA_MAX_LIMIT,
  NIVODA_REQUEST_TIMEOUT_MS,
  withAuthRetry,
  randomDelay,
  WORKER_DESYNC_MIN_MS,
  WORKER_DESYNC_MAX_MS,
} from '@diamond/shared';
import {
  AUTHENTICATE_QUERY,
  DIAMONDS_COUNT_QUERY,
  DIAMONDS_BY_QUERY,
  CREATE_HOLD_MUTATION,
  CANCEL_HOLD_MUTATION,
  CREATE_ORDER_MUTATION,
} from './queries.js';
import type {
  NivodaQuery,
  NivodaDiamondsResponse,
  NivodaHoldResponse,
  NivodaOrderItemInput,
} from './types.js';

interface AuthenticateResponse {
  authenticate: {
    username_and_password: {
      token: string;
    };
  };
}

interface DiamondsCountResponse {
  as: {
    diamonds_by_query_count: number;
  };
}

interface DiamondsQueryResponse {
  as: {
    diamonds_by_query: NivodaDiamondsResponse;
  };
}

interface CreateHoldResponse {
  as: {
    create_hold: NivodaHoldResponse;
  };
}

interface CancelHoldResponse {
  as: {
    cancel_hold: NivodaHoldResponse;
  };
}

interface CreateOrderResponse {
  as: {
    create_order: string;
  };
}

/**
 * Configuration options for NivodaAdapter
 */
export interface NivodaAdapterConfig {
  /** Request timeout in milliseconds (default: NIVODA_REQUEST_TIMEOUT_MS) */
  requestTimeoutMs?: number;
  /** Enable desync delay before API calls (default: false, enable in workers) */
  enableDesyncDelay?: boolean;
  /** Optional rate limiter function to call before each API request */
  rateLimiter?: () => Promise<void>;
}

/**
 * Error thrown when authentication fails after retries
 */
export class NivodaAuthError extends Error {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'NivodaAuthError';
    this.originalError = originalError;
  }
}

/**
 * Adapter for the Nivoda GraphQL API with robust error handling.
 *
 * Features:
 * - Token caching with automatic refresh
 * - Request timeouts
 * - Auth failure handling with automatic token clearing
 * - Optional rate limiter integration
 * - Optional desync delay for worker coordination
 *
 * Token clearing rules:
 * - Clear token only on authentication failures or invalid token responses
 * - Do NOT clear token on ordinary query failures or timeouts
 */
export class NivodaAdapter {
  private client: GraphQLClient;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private username: string;
  private password: string;
  private requestTimeoutMs: number;
  private enableDesyncDelay: boolean;
  private rateLimiter?: () => Promise<void>;

  // Track if we're currently authenticating to prevent concurrent auth calls
  private authPromise: Promise<string> | null = null;

  constructor(
    endpoint?: string,
    username?: string,
    password?: string,
    config: NivodaAdapterConfig = {}
  ) {
    this.requestTimeoutMs = config.requestTimeoutMs ?? NIVODA_REQUEST_TIMEOUT_MS;
    this.enableDesyncDelay = config.enableDesyncDelay ?? false;
    this.rateLimiter = config.rateLimiter;

    // Create a custom fetch function with timeout using AbortController
    const timeoutMs = this.requestTimeoutMs;
    const fetchWithTimeout: typeof fetch = async (input, init) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });
        return response;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Create client with custom fetch for timeout support
    this.client = new GraphQLClient(endpoint ?? requireEnv('NIVODA_ENDPOINT'), {
      fetch: fetchWithTimeout,
    });

    this.username = username ?? requireEnv('NIVODA_USERNAME');
    this.password = password ?? requireEnv('NIVODA_PASSWORD');
  }

  /**
   * Ensures we have a valid authentication token.
   * Uses token caching and handles concurrent auth requests.
   *
   * @throws NivodaAuthError if authentication fails after retries
   */
  private async ensureAuthenticated(): Promise<string> {
    const now = Date.now();

    // Check if we have a valid cached token
    if (this.token && this.tokenExpiresAt > now + TOKEN_EXPIRY_BUFFER_MS) {
      return this.token;
    }

    // If another call is already authenticating, wait for it
    if (this.authPromise) {
      return this.authPromise;
    }

    // Start authentication with deduplication
    this.authPromise = this.authenticate();

    try {
      const token = await this.authPromise;
      return token;
    } finally {
      this.authPromise = null;
    }
  }

  /**
   * Performs authentication with retry logic for transient failures.
   */
  private async authenticate(): Promise<string> {
    try {
      const response = await withAuthRetry(
        async () => {
          return this.client.request<AuthenticateResponse>(
            AUTHENTICATE_QUERY,
            {
              username: this.username,
              password: this.password,
            }
          );
        },
        {
          onRetry: (error, attempt) => {
            // Log auth retry (caller should have logging context)
            console.warn(`[NivodaAdapter] Auth retry ${attempt}: ${error.message}`);
          },
        }
      );

      this.token = response.authenticate.username_and_password.token;
      this.tokenExpiresAt = Date.now() + TOKEN_LIFETIME_MS;

      return this.token;
    } catch (error) {
      // Clear any stale token
      this.clearTokenCache();

      const message = error instanceof Error ? error.message : String(error);
      throw new NivodaAuthError(
        `Authentication failed: ${message}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Executes a pre-request hook including rate limiting and desync delay.
   */
  private async preRequest(): Promise<void> {
    // Add desync delay if enabled (for worker coordination)
    if (this.enableDesyncDelay) {
      await randomDelay(WORKER_DESYNC_MIN_MS, WORKER_DESYNC_MAX_MS);
    }

    // Acquire rate limit token if rate limiter is configured
    if (this.rateLimiter) {
      await this.rateLimiter();
    }
  }

  /**
   * Checks if an error indicates an invalid/expired token.
   */
  private isTokenError(error: unknown): boolean {
    if (error instanceof ClientError) {
      const message = error.message.toLowerCase();
      return (
        message.includes('unauthorized') ||
        message.includes('invalid token') ||
        message.includes('token expired') ||
        message.includes('authentication required')
      );
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('unauthorized') ||
        message.includes('invalid token') ||
        message.includes('token expired')
      );
    }
    return false;
  }

  /**
   * Executes a GraphQL request with token refresh on auth errors.
   * Does NOT clear token on ordinary failures (timeouts, network errors).
   */
  private async executeWithTokenRefresh<T>(
    operation: (token: string) => Promise<T>
  ): Promise<T> {
    await this.preRequest();

    const token = await this.ensureAuthenticated();

    try {
      return await operation(token);
    } catch (error) {
      // Only clear token and retry on token-specific errors
      if (this.isTokenError(error)) {
        this.clearTokenCache();

        // Retry once with fresh token
        const freshToken = await this.ensureAuthenticated();
        return operation(freshToken);
      }

      // Re-throw other errors without clearing token
      throw error;
    }
  }

  async getDiamondsCount(query: NivodaQuery): Promise<number> {
    return this.executeWithTokenRefresh(async (token) => {
      const response = await this.client.request<DiamondsCountResponse>(
        DIAMONDS_COUNT_QUERY,
        { token, query }
      );
      return response.as.diamonds_by_query_count;
    });
  }

  async searchDiamonds(
    query: NivodaQuery,
    options: {
      offset?: number;
      limit?: number;
      order?: { type: string; direction: string };
    } = {}
  ): Promise<NivodaDiamondsResponse> {
    return this.executeWithTokenRefresh(async (token) => {
      const limit = Math.min(options.limit ?? NIVODA_MAX_LIMIT, NIVODA_MAX_LIMIT);

      const response = await this.client.request<DiamondsQueryResponse>(
        DIAMONDS_BY_QUERY,
        {
          token,
          query,
          offset: options.offset ?? 0,
          limit,
          order: options.order,
        }
      );

      return response.as.diamonds_by_query;
    });
  }

  async createHold(offerId: string): Promise<NivodaHoldResponse> {
    return this.executeWithTokenRefresh(async (token) => {
      const response = await this.client.request<CreateHoldResponse>(
        CREATE_HOLD_MUTATION,
        {
          token,
          productId: offerId
        }
      );
      return response.as.create_hold;
    });
  }

  async cancelHold(holdId: string): Promise<NivodaHoldResponse> {
    return this.executeWithTokenRefresh(async (token) => {
      const response = await this.client.request<CancelHoldResponse>(
        CANCEL_HOLD_MUTATION,
        {
          token,
          holdId: holdId
        }
      );
      return response.as.cancel_hold;
    });
  }

  async createOrder(
    items: NivodaOrderItemInput[]
  ): Promise<string> {
    return this.executeWithTokenRefresh(async (token) => {
      const response = await this.client.request<CreateOrderResponse>(
        CREATE_ORDER_MUTATION,
        {
          token,
          items
        }
      );
      return response.as.create_order;
    });
  }

  /**
   * Clears the cached authentication token.
   * Call this only on authentication failures, NOT on ordinary query failures.
   */
  clearTokenCache(): void {
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Configures a rate limiter function to be called before each API request.
   */
  setRateLimiter(rateLimiter: () => Promise<void>): void {
    this.rateLimiter = rateLimiter;
  }

  /**
   * Enables or disables the desync delay before API calls.
   */
  setDesyncDelay(enabled: boolean): void {
    this.enableDesyncDelay = enabled;
  }
}
