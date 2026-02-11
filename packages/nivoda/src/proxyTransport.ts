import { createServiceLogger, optionalEnv } from '@diamond/shared';

const logger = createServiceLogger('nivoda-proxy-transport');

export class ProxyGraphqlTransport {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly serviceName: string;

  constructor(baseUrl: string, internalToken: string, timeoutMs = 65_000) {
    this.endpoint = baseUrl.replace(/\/$/, "") + "/api/v2/internal/nivoda/graphql";
    this.token = internalToken;
    this.timeoutMs = timeoutMs;
    this.serviceName = optionalEnv('SERVICE_NAME', 'unknown');

    logger.info('proxy_transport_initialized', {
      service: this.serviceName,
      endpoint: this.endpoint,
      timeoutMs: this.timeoutMs,
    });
  }

  async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const operationName = this.extractOperationName(query);
    const startTime = Date.now();

    logger.info('proxy_request_start', {
      service: this.serviceName,
      operationName,
      endpoint: this.endpoint,
      hasVariables: Object.keys(variables).length > 0,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-internal-token": this.token,
        },
        body: JSON.stringify({ query, variables }),
      });

      clearTimeout(timeout);
      const text = await res.text();
      const duration = Date.now() - startTime;

      if (!res.ok) {
        let errorMessage: string;
        try {
          const parsed = JSON.parse(text);
          errorMessage = parsed.error?.message || text;
        } catch {
          errorMessage = text;
        }

        logger.error('proxy_request_failed', new Error(errorMessage), {
          service: this.serviceName,
          operationName,
          status: res.status,
          duration,
          endpoint: this.endpoint,
        });

        const error = new Error(
          `Nivoda proxy error ${res.status}: ${errorMessage}`
        );
        (error as any).statusCode = res.status;
        (error as any).query = query.substring(0, 100);
        throw error;
      }

      logger.info('proxy_request_success', {
        service: this.serviceName,
        operationName,
        status: res.status,
        duration,
        endpoint: this.endpoint,
      });

      return JSON.parse(text).data as T;
    } catch (error) {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('proxy_request_timeout', error, {
          service: this.serviceName,
          operationName,
          duration,
          timeoutMs: this.timeoutMs,
          endpoint: this.endpoint,
        });
        throw new Error(`Nivoda proxy request timeout after ${this.timeoutMs}ms`);
      }

      logger.error('proxy_request_error', error instanceof Error ? error : new Error(String(error)), {
        service: this.serviceName,
        operationName,
        duration,
        endpoint: this.endpoint,
      });

      throw error;
    }
  }

  private extractOperationName(query: string): string {
    // Extract operation name from GraphQL query (e.g., "query authenticate" -> "authenticate")
    const match = query.match(/(?:query|mutation)\s+(\w+)/);
    return match?.[1] ?? 'unknown';
  }
}
