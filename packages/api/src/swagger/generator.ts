import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Diamond Platform API',
      version: '2.0.0',
      description: 'API for diamond inventory management',
    },
    servers: [
      {
        url: '/',
        description: 'Current environment (relative path)',
      },
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: `API key for authentication. Pass your API key in the X-API-Key header.`,
        }
      },
    },
  },
  // Use glob pattern to match both .ts (dev) and .js (production)
  apis: [path.join(__dirname, '../routes/diamonds.{ts,js}')],
};

const spec = swaggerJsdoc(options);

const outputPath = path.join(__dirname, '../../../../swagger.json');
fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

console.log(`Swagger spec generated at ${outputPath}`);

export { spec };
