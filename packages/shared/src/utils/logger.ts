import { pino, Logger as PinoLogger, LoggerOptions } from 'pino';

/**
 * Log context that can be attached to log entries for correlation and filtering.
 * These fields flow through the pipeline for distributed tracing.
 */
export interface LogContext {
  /** Unique identifier for the entire pipeline run */
  runId?: string;
  /** Unique identifier for trace correlation across services */
  traceId?: string;
  /** Identifier for the worker processing the task */
  workerId?: string;
  /** Identifier for the partition being processed */
  partitionId?: string;
  /** Data supplier identifier (e.g., 'nivoda', 'rapaport') */
  supplier?: string;
  /** Individual diamond/product identifier */
  diamondId?: string;
  /** Service/component name */
  service?: string;
  /** HTTP request ID for API calls */
  requestId?: string;
  /** Component within a service */
  component?: string;
  /** HTTP method for API requests */
  method?: string;
  /** HTTP path for API requests */
  path?: string;
  /** Allow additional string keys for flexibility */
  [key: string]: string | undefined;
}

/**
 * Extended logger interface with context support
 */
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void;
  fatal(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void;

  /**
   * Create a child logger with additional context.
   * The context is merged with parent context and included in all log entries.
   */
  child(context: LogContext): Logger;

  /**
   * Get the current context attached to this logger
   */
  getContext(): LogContext;
}

/**
 * Wrapper around pino that provides context-aware logging
 */
class ContextLogger implements Logger {
  private pino: PinoLogger;
  private context: LogContext;

  constructor(pinoInstance: PinoLogger, context: LogContext = {}) {
    this.pino = pinoInstance;
    this.context = context;
  }

  private formatData(data?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.context, ...data };
  }

  private formatError(error?: Error | unknown): Record<string, unknown> {
    if (!error) return {};
    if (error instanceof Error) {
      // Truncate stack to first 5 frames to avoid exceeding Azure log size limits
      const stackLines = error.stack?.split('\n') ?? [];
      const truncatedStack = stackLines.slice(0, 6).join('\n');

      return {
        err: {
          type: error.name,
          message: error.message,
          stack: truncatedStack,
        },
      };
    }
    return { err: String(error) };
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    this.pino.debug(this.formatData(data), msg);
  }

  info(msg: string, data?: Record<string, unknown>): void {
    this.pino.info(this.formatData(data), msg);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    this.pino.warn(this.formatData(data), msg);
  }

  error(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.pino.error({ ...this.formatData(data), ...this.formatError(error) }, msg);
  }

  fatal(msg: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.pino.fatal({ ...this.formatData(data), ...this.formatError(error) }, msg);
  }

  child(context: LogContext): Logger {
    const mergedContext = { ...this.context, ...context };
    const childPino = this.pino.child(context);
    return new ContextLogger(childPino, mergedContext);
  }

  getContext(): LogContext {
    return { ...this.context };
  }
}

/**
 * Configuration options for creating a logger
 */
export interface CreateLoggerOptions {
  /** Service name to include in all log entries */
  service: string;
  /** Log level (default: 'info', or 'debug' if LOG_LEVEL env is set) */
  level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  /** Force pretty printing regardless of environment */
  pretty?: boolean;
  /** Additional context to include in all log entries */
  context?: LogContext;
}

/**
 * Determine if we should use pretty printing
 */
function shouldUsePretty(forceFlag?: boolean): boolean {
  if (forceFlag !== undefined) return forceFlag;
  const nodeEnv = process.env.NODE_ENV;
  return nodeEnv === 'development' || nodeEnv === 'test' || !nodeEnv;
}

/**
 * Get the log level from environment or default
 */
function getLogLevel(configLevel?: string): string {
  return configLevel ?? process.env.LOG_LEVEL ?? 'info';
}

/**
 * Create a new logger instance with the specified configuration.
 *
 * @example
 * ```typescript
 * const logger = createLogger({ service: 'worker' });
 * logger.info('Starting worker');
 *
 * const childLogger = logger.child({ runId: '123', partitionId: 'p1' });
 * childLogger.info('Processing partition'); // includes runId and partitionId
 * ```
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const usePretty = shouldUsePretty(options.pretty);
  const level = getLogLevel(options.level);

  const pinoOptions: LoggerOptions = {
    level,
    base: {
      service: options.service,
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    // Add serializers to prevent Azure log size limit (32KB) from being exceeded
    serializers: {
      payload: (value: unknown) => {
        const str = JSON.stringify(value);
        // Truncate large payloads to 1KB to stay well under Azure's 32KB limit
        return str.length > 1024 ? str.slice(0, 1024) + '...[truncated]' : str;
      },
      rawPayload: (value: unknown) => {
        const str = JSON.stringify(value);
        return str.length > 1024 ? str.slice(0, 1024) + '...[truncated]' : str;
      },
      response: (value: unknown) => {
        const str = JSON.stringify(value);
        return str.length > 2048 ? str.slice(0, 2048) + '...[truncated]' : str;
      },
    },
  };

  // Use pino-pretty transport for human-readable output in development
  if (usePretty) {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        messageFormat: '{service} | {msg}',
      },
    };
  }

  const pinoInstance = pino(pinoOptions);
  return new ContextLogger(pinoInstance, options.context ?? {});
}

/**
 * Generate a unique trace ID for request correlation.
 * Uses crypto.randomUUID() for uniqueness.
 */
export function generateTraceId(): string {
  return crypto.randomUUID();
}

/**
 * No-op logger for testing or when logging should be disabled
 */
export const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => nullLogger,
  getContext: () => ({}),
};
