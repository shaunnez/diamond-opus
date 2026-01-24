import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { optionalEnv } from '@diamond/shared';
import routes from './routes/index.js';
import { errorHandler, captureRawBody } from './middleware/index.js';
import { spec } from './swagger/generator.js';

export function createApp(): express.Application {
  const app = express();

  app.use(cors());

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody: string }).rawBody = buf.toString();
      },
    })
  );

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

  app.use(routes);

  app.use(errorHandler);

  return app;
}

export function startServer(): void {
  const app = createApp();
  const port = parseInt(optionalEnv('PORT', '3000'), 10);

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Swagger UI available at http://localhost:${port}/api-docs`);
  });
}
