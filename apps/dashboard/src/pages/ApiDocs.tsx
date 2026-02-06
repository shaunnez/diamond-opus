import { Header } from '../components/layout/Header';

function getSwaggerUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    // Strip /api/v2 suffix to get the base API origin
    try {
      const url = new URL(apiUrl);
      return `${url.origin}/api-docs`;
    } catch {
      // Relative URL - strip path suffix
      return '/api-docs';
    }
  }
  // Dev proxy handles this
  return '/api-docs';
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
