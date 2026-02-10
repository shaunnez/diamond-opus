export class ProxyGraphqlTransport {
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, internalToken: string, timeoutMs = 30_000) {
    this.endpoint = baseUrl.replace(/\/$/, "") + "/api/v2/internal/nivoda/graphql";
    this.token = internalToken;
    this.timeoutMs = timeoutMs;
  }

  async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
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

      if (!res.ok) {
        let errorMessage: string;
        try {
          const parsed = JSON.parse(text);
          errorMessage = parsed.error?.message || text;
        } catch {
          errorMessage = text;
        }

        const error = new Error(
          `Nivoda proxy error ${res.status}: ${errorMessage}`
        );
        (error as any).statusCode = res.status;
        (error as any).query = query.substring(0, 100);
        throw error;
      }
      
      return JSON.parse(text).data as T;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Nivoda proxy request timeout after ${this.timeoutMs}ms`);
      }

      throw error;
    }
  }
}
