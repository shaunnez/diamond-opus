import { Header } from '../components/layout/Header';
import { getApiBaseUrl } from '../api/client';

function getSwaggerUrl(): string {
  const apiBaseUrl = getApiBaseUrl();
  try {
    // If VITE_API_URL is an absolute URL, extract the origin
    const url = new URL(apiBaseUrl);
    return `${url.origin}/api-docs/`;
  } catch {
    // Relative path - construct from current window origin
    return `${window.location.origin}/api-docs/`;
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
