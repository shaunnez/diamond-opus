import { GraphQLClient } from 'graphql-request';
import {
  requireEnv,
  TOKEN_LIFETIME_MS,
  TOKEN_EXPIRY_BUFFER_MS,
  NIVODA_MAX_LIMIT,
} from '@diamond/shared';
import {
  AUTHENTICATE_QUERY,
  DIAMONDS_COUNT_QUERY,
  DIAMONDS_BY_QUERY,
  CREATE_HOLD_MUTATION,
  CREATE_ORDER_MUTATION,
} from './queries.js';
import type {
  NivodaQuery,
  NivodaDiamondsResponse,
  NivodaHoldResponse,
  NivodaOrderResponse,
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

interface CreateOrderResponse {
  as: {
    create_order: NivodaOrderResponse;
  };
}

export class NivodaAdapter {
  private client: GraphQLClient;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private username: string;
  private password: string;

  constructor(endpoint?: string, username?: string, password?: string) {
    this.client = new GraphQLClient(endpoint ?? requireEnv('NIVODA_ENDPOINT'));
    this.username = username ?? requireEnv('NIVODA_USERNAME');
    this.password = password ?? requireEnv('NIVODA_PASSWORD');
  }

  private async ensureAuthenticated(): Promise<string> {
    const now = Date.now();
    if (this.token && this.tokenExpiresAt > now + TOKEN_EXPIRY_BUFFER_MS) {
      return this.token;
    }

    const response = await this.client.request<AuthenticateResponse>(
      AUTHENTICATE_QUERY,
      {
        username: this.username,
        password: this.password,
      }
    );

    this.token = response.authenticate.username_and_password.token;
    this.tokenExpiresAt = now + TOKEN_LIFETIME_MS;

    return this.token;
  }

  async getDiamondsCount(query: NivodaQuery): Promise<number> {
    const token = await this.ensureAuthenticated();

    const response = await this.client.request<DiamondsCountResponse>(
      DIAMONDS_COUNT_QUERY,
      { token, query }
    );

    return response.as.diamonds_by_query_count;
  }

  async searchDiamonds(
    query: NivodaQuery,
    options: {
      offset?: number;
      limit?: number;
      order?: { type: string; direction: string };
    } = {}
  ): Promise<NivodaDiamondsResponse> {
    const token = await this.ensureAuthenticated();

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
  }

  async createHold(offerId: string): Promise<NivodaHoldResponse> {
    const token = await this.ensureAuthenticated();

    const response = await this.client.request<CreateHoldResponse>(
      CREATE_HOLD_MUTATION,
      {
        token,
        productId: offerId,
        productType: 'diamond',
      }
    );

    return response.as.create_hold;
  }

  async createOrder(
    offerId: string,
    destinationId: string,
    options: {
      reference?: string;
      comments?: string;
      returnOption?: string;
    } = {}
  ): Promise<NivodaOrderResponse> {
    const token = await this.ensureAuthenticated();

    const response = await this.client.request<CreateOrderResponse>(
      CREATE_ORDER_MUTATION,
      {
        token,
        offerId,
        destinationId,
        reference: options.reference,
        comments: options.comments,
        returnOption: options.returnOption,
      }
    );

    return response.as.create_order;
  }

  clearTokenCache(): void {
    this.token = null;
    this.tokenExpiresAt = 0;
  }
}
