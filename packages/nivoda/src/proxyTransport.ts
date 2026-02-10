export class ProxyGraphqlTransport {
  private readonly endpoint: string;
  private readonly token: string;

  constructor(baseUrl: string, internalToken: string) {
    this.endpoint = baseUrl.replace(/\/$/, "") + "/api/v2/internal/nivoda/graphql";
    this.token = internalToken;
  }

  async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": this.token,
      },
      body: JSON.stringify({ query, variables }),
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`Proxy error ${res.status}: ${text}`);
    }

    return JSON.parse(text) as T;
  }
}
