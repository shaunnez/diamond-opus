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
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: `API key for authentication.

IMPORTANT: When using API key authentication, HMAC authentication will NOT be attempted as a fallback.
If the API key is invalid, the request will be rejected immediately.

Use either API key OR HMAC authentication, not both.`,
        },
        HmacAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Signature',
          description: `HMAC-SHA256 authentication. Required headers:
- X-Client-Id: Client identifier
- X-Timestamp: Unix timestamp (seconds)
- X-Signature: HMAC-SHA256 signature

Signature computation:
\`\`\`
canonical_string = METHOD + '\\n' + PATH + '\\n' + TIMESTAMP + '\\n' + SHA256(BODY)
signature = HMAC-SHA256(CLIENT_SECRET, canonical_string)
\`\`\`

Timestamp must be within ±5 minutes of server time.

IMPORTANT: HMAC authentication is only attempted when NO X-API-Key header is provided.
Use either API key OR HMAC authentication, not both.`,
        },
      },
    },
  },
  apis: [path.join(__dirname, '../routes/*.ts'), path.join(__dirname, '../routes/*.js')],
};

const spec = swaggerJsdoc(options);

const outputPath = path.join(__dirname, '../../../../swagger.json');
fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));

console.log(`Swagger spec generated at ${outputPath}`);

export { spec };
