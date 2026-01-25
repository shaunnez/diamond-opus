import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { optionalEnv, createLogger, generateTraceId } from '@diamond/shared';
import routes from './routes/index.js';
import { errorHandler } from './middleware/index.js';
import { spec } from './swagger/generator.js';

const logger = createLogger({ service: 'api' });

// Extend Express Request to include logger and requestId
declare global {
  namespace Express {
    interface Request {
      log: typeof logger;
      requestId: string;
      rawBody?: string;
    }
  }
}

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

  // Request logging middleware
  app.use((req, res, next) => {
    const requestId = generateTraceId();
    const startTime = Date.now();

    req.requestId = requestId;
    req.log = logger.child({
      requestId,
      method: req.method,
      path: req.path,
    }) as typeof logger;

    req.log.info('Request received', {
      query: req.query,
      userAgent: req.get('user-agent'),
    });

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      req.log.info('Request completed', {
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  });

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));

  app.use(routes);

  app.use(errorHandler);

  return app;
}

export function startServer(): void {
  const app = createApp();
  const port = parseInt(optionalEnv('PORT', '3000'), 10);

  app.listen(port, () => {
    logger.info('Server started', { port });
    logger.info('Swagger UI available', { url: `http://localhost:${port}/api-docs` });
  });
}

export { logger };
