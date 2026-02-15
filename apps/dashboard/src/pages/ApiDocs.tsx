import { Header } from '../components/layout/Header';

// Always use relative path to leverage nginx proxy in production
// and Vite proxy in development. This avoids CORS issues and
// ensures we're loading through the same origin.
function getSwaggerUrl(): string {
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
          allow="same-origin"
        />
      </div>
    </>
  );
}
