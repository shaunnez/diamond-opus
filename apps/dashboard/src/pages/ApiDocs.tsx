import { Header } from '../components/layout/Header';
import { getApiBaseUrl } from '../api/client';

function getSwaggerUrl(): string {
  const apiBaseUrl = getApiBaseUrl();
  try {
    const url = new URL(apiBaseUrl);
    return `${url.origin}/api-docs`;
  } catch {
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
