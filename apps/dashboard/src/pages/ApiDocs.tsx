import { Header } from '../components/layout/Header';
import { optionalEnv } from '@diamond/shared';

function getSwaggerUrl(): string {
  const apiBaseUrl = optionalEnv('API_URL', '') + '/api-docs'; 
  return apiBaseUrl;
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
