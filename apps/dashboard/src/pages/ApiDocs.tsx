import { Header } from '../components/layout/Header';
import { getApiBaseUrl } from '../api/client';

function getSwaggerUrl(): string {
  const apiBaseUrl = getApiBaseUrl();

  // Strip /api/v2 suffix to get the base API origin
  try {
    const url = new URL(apiBaseUrl);
    return `${url.origin}/api-docs`;
  } catch {
    // Relative URL - strip path suffix and append /api-docs
    return '/api-docs';
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
        />
      </div>
    </>
  );
}
