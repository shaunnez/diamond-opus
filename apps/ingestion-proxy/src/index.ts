if (process.env.NODE_ENV !== 'production') {
  const { config } = await import('dotenv');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const rootDir = resolve(__dirname, '../../..');

  config({ path: resolve(rootDir, '.env.local') });
  config({ path: resolve(rootDir, '.env') });
}


import express from "express";
import type { Request, Response } from "express";
import { createServiceLogger, optionalEnv } from "@diamond/shared";
import proxyRouter from "./routes/proxy.js";

const logger = createServiceLogger('ingestion-proxy', { component: 'server' });
const app = express();

// Middleware
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/graphql", proxyRouter);

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Start server
const port = Number(optionalEnv('PORT', '3001'));
const server = app.listen(port, () => {
  const traceId = crypto.randomUUID();
  logger.info('server_started', {
    traceId,
    port,
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  const traceId = crypto.randomUUID();
  logger.info('server_shutdown_initiated', {
    traceId,
    signal,
  });

  server.close((err) => {
    if (err) {
      logger.error('server_shutdown_error', err, { traceId });
      process.exit(1);
    }

    logger.info('server_shutdown_complete', { traceId });
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.warn('server_shutdown_forced', {
      traceId,
      reason: 'Shutdown timeout exceeded 10 seconds',
    });
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
