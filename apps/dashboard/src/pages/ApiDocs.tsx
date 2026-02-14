import { Header } from '../components/layout/Header';
import { getApiBaseUrl } from '../api/client';

function getSwaggerUrl(): string {
  const apiBaseUrl = getApiBaseUrl();
  try {
    // If VITE_API_URL is an absolute URL (e.g. https://api.example.com/api/v2),
    // derive /api-docs from the same origin
    const url = new URL(apiBaseUrl);
    return `${url.origin}/api-docs/`;
  } catch {
    // Relative path (e.g. /api/v2) — api-docs is served from the same host,
    // either via vite proxy (dev) or nginx proxy (prod)
    return '/api-docs/';
  }
}

export function ApiDocs() {
  const swaggerUrl = getSwaggerUrl();

  return (
    <>
      <Header />
      <div className="h-[calc(100vh-4rem)]">
        <iframe
          src={swaggerUrl}
          title="API Documentation"
          className="w-full h-full border-0"
          allow="same-origin"
        />
      </div>
    </>
  );
}
